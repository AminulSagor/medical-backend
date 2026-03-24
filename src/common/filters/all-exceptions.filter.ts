import {
    ArgumentsHost,
    Catch,
    ExceptionFilter,
    HttpException,
    HttpStatus,
} from "@nestjs/common";
import { Request, Response } from "express";

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
    catch(exception: unknown, host: ArgumentsHost) {
        const ctx = host.switchToHttp();
        const res = ctx.getResponse<Response>();
        const req = ctx.getRequest<Request>();

        const isHttp = exception instanceof HttpException;
        const status = isHttp
            ? exception.getStatus()
            : HttpStatus.INTERNAL_SERVER_ERROR;

        const message = isHttp
            ? (exception.getResponse() as any)?.message || exception.message
            : "Internal server error";

        // Skip logging for development tool polling (VS Code, Postman, etc.)
        const skipLogging = req.url === '/__server_sent_events__';
        
        // ✅ IMPORTANT: log the real error + stack trace in terminal
        if (!skipLogging) {
            // eslint-disable-next-line no-console
            console.error("🔥 API ERROR:", {
                method: req.method,
                url: req.url,
                status,
                exception,
            });
        }

        // return minimal response
        res.status(status).json({
            statusCode: status,
            path: req.url,
            message,
        });
    }
}
