package au.csiro.data61.magda.search

import akka.http.scaladsl.server.Directives._
import akka.http.scaladsl.server.Directive1
import au.csiro.data61.magda.client.{AuthApiClient, AuthDecisionReqConfig}
import akka.http.scaladsl.model.StatusCodes.BadRequest
import au.csiro.data61.magda.directives.AuthDirectives.{
  withAllAuthDecisions,
  withAuthDecision
}
import au.csiro.data61.magda.model.Auth.AuthDecision

object Directives {

  /**
    *  Get read auth decision for datasets
    * 
    *  Used by search facets and other dataset list operations
    *  Pass 'enforceAuth' through so it can be set to 'false' for search filtering
    * 
    *  @param enforceAuth // If true, returns 401 unauthorized when the user does not have read permission.
    *                     // If false (default), just provides the decision (for filtering search results.)
    */

  def withDatasetReadAuthDecision(
      authApiClient: AuthApiClient,
      publishingStatus: Option[String],
      enforceAuth: Boolean = false // New: default, = false for backward compatibility
  ): Directive1[AuthDecision] = {
    val datasetType = publishingStatus.getOrElse("*")
    if (datasetType != "*" && !datasetType.matches("^[\\w\\d-_]+$")) {
      complete(BadRequest, s"Invalid publishing status: ${datasetType}")
    } else {
      val operationUrl = s"object/dataset/${datasetType}/read"
      withAuthDecision(
        authApiClient, 
        AuthDecisionReqConfig(operationUrl),
         enforceAuth = enforceAuth // Pass through to the updated withAuthDecision
      ) 
    }
  }

  /**
   * Get read auth decisions for both datasets and distributions.
   * Used by the main /search/datasets endpoint
   * 
   * Use non-enforcing mode (withAllAuthDecisions) because search needs partial evaluation + filtering, not a hard 401 code
   * 
   * @param enforceAuth If true, returns 401 Unauthorized when permission is denied.
   *                    If false (default), provides decisions for filtering
   */
  def withDatasetAndDistributionReadAuthDecision(
      authApiClient: AuthApiClient,
      publishingStatus: Option[String],
      enforceAuth: Boolean = false // Ignored for search - filter mode is better suggestion
  ): Directive1[Seq[AuthDecision]] = {
    val requestRecordType = publishingStatus.getOrElse("*")
    if (requestRecordType != "*" && !requestRecordType.matches("^[\\w\\d-_]+$")) {
      complete(BadRequest, s"Invalid publishing status: ${requestRecordType}")
    } else {
      val configList = Seq(
        AuthDecisionReqConfig(s"object/dataset/${requestRecordType}/read"),
        AuthDecisionReqConfig(s"object/distribution/${requestRecordType}/read")
      )
      withAllAuthDecisions(authApiClient, configList) // Always non-enforcing decisions for filtering
    }
  }

}