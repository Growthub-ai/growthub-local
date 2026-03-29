export class HttpError extends Error {
    status;
    details;
    constructor(status, message, details) {
        super(message);
        this.status = status;
        this.details = details;
    }
}
export function badRequest(message, details) {
    return new HttpError(400, message, details);
}
export function unauthorized(message = "Unauthorized") {
    return new HttpError(401, message);
}
export function forbidden(message = "Forbidden") {
    return new HttpError(403, message);
}
export function notFound(message = "Not found") {
    return new HttpError(404, message);
}
export function conflict(message, details) {
    return new HttpError(409, message, details);
}
export function unprocessable(message, details) {
    return new HttpError(422, message, details);
}
//# sourceMappingURL=errors.js.map