package au.csiro.data61.magda.directives

import akka.http.scaladsl.model.StatusCodes.{Forbidden, InternalServerError, Unauthorized}
import akka.http.scaladsl.marshallers.sprayjson.SprayJsonSupport._

import akka.http.scaladsl.server.Directives._
import akka.http.scaladsl.server.AuthorizationFailedRejection
import akka.http.scaladsl.server.{Directive0, Directive1, ValidationRejection}

import au.csiro.data61.magda.Authentication
import au.csiro.data61.magda.client.{AuthApiClient, AuthDecisionReqConfig}
import au.csiro.data61.magda.model.Auth
import au.csiro.data61.magda.model.Auth.AuthDecision

import io.jsonwebtoken.{Claims, Jws}
import spray.json.{JsObject, JsString, JsBoolean}

import scala.concurrent.Future
import scala.util.{Failure, Success}

object AuthDirectives {

  /**
    * Core authorization directive used across the system.
    * 
    * This directive supports two modes:
    *   1. Non-enforcing mode (enforceAuth = false):
    *      - Used for search operations where results should be filtered rather than blocked.
    * 
    *   2. Enforcing mode (enforceAuth = true)
    *      - Used for direct access to protected resources, returning 401/403 as appropriate.
    * 
    * This separation enables a dual-layer security model:
    *   - Search remains functional for all users
    *   - Restricted resources are protected when accessed directly
    * 
    * @param authApiClient
    * @param config
    * 
    * 
    * @param enforceAuth  Controls whether the authorization is enforced:
    *                    // - False (default): Non-enforcing mode used for search operations.
    *                    //   Requests are allowed to proceed and results are filtered instead of returning 401.
    *                    // - True: Enforcing mode used for direct resource access.
    *                    // Returns:
    *                    //   - 401 if the user is not authenticated
    *                    //   - 403 if the user is authenticated but lacks permission        
    * @return // Directive1[AuthDecision]
    */
  def withAuthDecision(
    authApiClient: AuthApiClient,
    config: AuthDecisionReqConfig,
    enforceAuth: Boolean = false
): Directive1[AuthDecision] =
  (extractLog & getJwt).tflatMap {
    case (log, jwt) =>
      onComplete(authApiClient.getAuthDecision(jwt, config)).flatMap {

        case Success(authDecision: AuthDecision) =>
          if (!enforceAuth) {
            provide(authDecision)
          } else if (authDecision.hasResidualRules) {
            log.warning(
              // Partial evaluation means the authorization engine could not make a definitive allow/deny decision.
              // For security reasons, this is treated as unauthorised to prevent accidental exposure of restricted data.
              "Partial evaluation only for operation `{}`. Treating as unauthorized.",
              config.operationUri
            )
            complete(
              Unauthorized,
              JsObject(
                "error" -> JsString("unauthorized"),
                "message" -> JsString(
                  s"You are not authorized to perform `${config.operationUri}` on the requested resource. Please login if you have access."
                ),
                "suggestLogin" -> JsBoolean(true)
              )
            )
          } else if (authDecision.result.exists(Auth.isTrueEquivalent)) {
            provide(authDecision)
          } else if (jwt.isEmpty) {
            complete(
              Unauthorized,
              JsObject(
                "error" -> JsString("unauthorized"),
                "message" -> JsString("This resource is private or restricted. Please log in to access it."),
                "suggestLogin" -> JsBoolean(true)
              )
            )
          } else {
            complete(
              Forbidden,
              JsObject(
                "error" -> JsString("forbidden"),
                "message" -> JsString("You do not have permission to access this restricted dataset.")
              )
            )
          }

        case Failure(e) =>
          log.error(
            e,
            s"Failed to get auth decision for operation `${config.operationUri}`"
          )

          complete(
            InternalServerError,
            JsObject(
              "error" -> JsString("authorization_error"),
              "message" -> JsString(
                "An error occurred while checking access permissions."
              )
            )
          )
      }
  }

  /**
    * Make one or more auth decisions based on supplied auth decision request config list.
    * Depends on the config provided, either partial eval (conditional decision on a set of records/objects)
    * Or unconditional decision for a single record / object will be returned.
    * @param authApiClient
    * @param configs a list of auth decision request config for each of auth decision sought
    * @return
    */
  def withAllAuthDecisions(
      authApiClient: AuthApiClient,
      configs: Seq[AuthDecisionReqConfig]
  ): Directive1[Seq[AuthDecision]] =
    (extractLog & getJwt & extractExecutionContext).tflatMap {
      case (log, jwt, ec) =>
        implicit val executor = ec
        val allDecisionRequests = Future.sequence(
          configs.map(config => authApiClient.getAuthDecision(jwt, config))
        )
        onComplete(allDecisionRequests).flatMap {
          case Success(authDecision: Seq[AuthDecision]) => provide(authDecision)
          case Failure(e) =>
            log.error("Failed to get auth decisions: {}", e)
            complete(
              InternalServerError,
              s"An error occurred while retrieving auth decisions for the request."
            )
        }
    }

  /**
    * Require unconditional auth decision based on auth decision request config.
    * When making decision on a group of records/objects, this method makes sure
    * the user has permission to all records/objects regardless individual record / object's attributes.
    *
    * @param authApiClient
    * @param config
    * @param requiredDecision
    * @return
    */
  def requireUnconditionalAuthDecision(
      authApiClient: AuthApiClient,
      config: AuthDecisionReqConfig,
      requiredDecision: Boolean = true
  ): Directive0 = withAuthDecision(authApiClient, config).flatMap {
    authDecision =>
      if (authDecision.hasResidualRules == false && authDecision.result.isDefined && (requiredDecision == Auth
            .isTrueEquivalent(authDecision.result.get))) {
        pass
      } else {
        complete(
          Forbidden,
          s"you are not permitted to perform `${config.operationUri}` on required resources."
        )
      }
  }

  /**
    * require permission based on input data provided.
    * Different from withAuthDecision, its method always set `unknowns` = Nil i.e. it will always attempt to make unconditional decision.
    * It's for make decision for one single record / object. For partial eval for a set of records / objects, please use `withAuthDecision` or `requireUnconditionalAuthDecision`
    * @param authApiClient
    * @param operationUri
    * @param input
    * @return
    */
  def requirePermission(
      authApiClient: AuthApiClient,
      operationUri: String,
      input: Option[JsObject]
  ): Directive0 =
    (extractLog & withAuthDecision(
      authApiClient,
      AuthDecisionReqConfig(operationUri, unknowns = Some(Nil), input = input)
    )).tflatMap {
      case (log, authDecision: AuthDecision) =>
        if (authDecision.hasResidualRules) {
          // Can't make unconditional decision, we should response 403 error
          log.warning(
            "Failed to make unconditional auth decision for operation `{}`. " +
              "Input: {}. ",
            operationUri,
            input
          )
          complete(
            Forbidden,
            s"you are not permitted to perform `${operationUri}`: no unconditional decision can be made."
          )
        } else {
          if (authDecision.result.isDefined && Auth.isTrueEquivalent(
                authDecision.result.get
              )) {
            // the request is permitted, passing to inner route for processing.
            pass
          } else {
            complete(
              Forbidden,
              s"you are not permitted to perform `${operationUri}`."
            )
          }
        }
    }

  /** Gets the X-Magda-Session header out of the request, providing it as a string without doing any verification */
  def getJwt: Directive1[Option[String]] = {
    extractRequest.flatMap { request =>
      val sessionToken =
        request.headers.find(_.is(Authentication.headerName.toLowerCase))

      provide(sessionToken.map(_.value()))
    }
  }

  /**
    * get current user ID from JWT token
    * If can't find JWT token, return None
    * @return
    */
  def getUserId: Directive1[Option[String]] = {
    extractLog.flatMap { logger =>
      getJwt.flatMap {
        case Some(jwtToken) =>
          try {
            val claims: Jws[Claims] =
              Authentication.parser(logger).parseClaimsJws(jwtToken)
            val userId = claims.getBody().get("userId", classOf[String])

            provide(Some(userId))
          } catch {
            case e: Throwable =>
              logger.error(
                e,
                "Failed to extract UserId from JWT token"
              )
              reject(
                ValidationRejection("Failed to retrieve userId from JWT token!")
              )
          }
        case _ => provide(None)
      }
    }
  }

  /**
    * get current user ID from JWT token
    * If can't locate userId, response 403 error
    * @return
    */
  def requireUserId: Directive1[String] = getUserId.flatMap {
    case Some(userId) => provide(userId)
    case _ =>
      complete(
        Forbidden,
        s"Anonymous users access are not permitted: userId is required."
      )
  }

  /**
    * Reusable helper to return a standardized 401 Unauthorized response.
    * Ensures consistent error structure for frontend handling.
    *
    * @param message
    */
  def rejectWithUnauthorized(message: String = "You are not authorized to access this resource. Please login if you have access."): Directive0 = {
  val errorBody = JsObject(
    "error"        -> JsString("unauthorized"),   // Consistent error type for frontend
    "message"      -> JsString(message),          // Human-readable message (customizable)
    "suggestLogin" -> JsBoolean(true)             // Flag that tells the frontend to show login prompt
  )
  complete(Unauthorized, errorBody)
 }

  /**
   * Directive for single-record / private resource access (e.g. GET /v0/registry/records/{id} or dataset detail page)
   * 
   * Behaviour:
      - If a user is not logged in (anonymous), returns 401 with a friendly "please log in" message.
      - If a user is logged in but permission denied, returns 403 forbidden
      - If permission granted, continues to the route handler

    This is the main directive suggested for use for private dataset/record routes.
   */
  def requirePermissionForPrivateResource(
    authApiClient: AuthApiClient,   // 1. Client to call the external Auth API (OPA)
    operationUri: String,           // 2. The permission operation being checked ("object/record/read")
    input: Option[JsObject] = None  // 3. Optional input data (e.g. record ID or aspect data for fine-grained check)
  ): Directive0 = 
    withAuthDecision(               // 4. Reuse the core decision logic
      authApiClient, 
      AuthDecisionReqConfig(        // 5. Build config for a single-resource unconditional check
        operationUri = operationUri,//  - What permission are we checking?
        unknowns = Some(Nil),       //  - Force unconditional decision (no partial eval)
        input = input               //  - Pass any record-specific data
        ),
        enforceAuth = true          // 6. This is the KEY: enable enforcement mode (triggers 401/403)
      ).flatMap(_ => pass)          // 7. If this is reached, permission granted, continue to route handler
}