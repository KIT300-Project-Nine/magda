import jwt from "jsonwebtoken";

export default function buildJwt(
    jwtSecret: string,
    userId: string,
    session: any = {}
) {
    // Explicit HS256 + no iat claim: matches Scala jjwt 0.10.x verification and avoids
    // intermittent "Failed to retrieve userId from JWT token!" when the registry parses X-Magda-Session.
    return jwt.sign({ userId, session }, jwtSecret, {
        algorithm: "HS256",
        noTimestamp: true
    });
}
