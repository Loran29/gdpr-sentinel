"""Custom exceptions and the FastAPI exception handlers that turn them into the
canonical error envelope from CONTRACT.md §9:

  {"error": {"code": "...", "message": "...", "details": {...}}}
"""

from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException


class AppError(Exception):
    code: str = "INTERNAL_ERROR"
    status_code: int = 500

    def __init__(self, message: str, details: dict | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.details = details or {}


class FileNotFoundAppError(AppError):
    code = "FILE_NOT_FOUND"
    status_code = 404


class ScanNotFoundError(AppError):
    code = "SCAN_NOT_FOUND"
    status_code = 404


class FindingNotFoundError(AppError):
    code = "FINDING_NOT_FOUND"
    status_code = 404


class UserNotFoundError(AppError):
    code = "USER_NOT_FOUND"
    status_code = 404


class InvalidActionError(AppError):
    code = "INVALID_ACTION"
    status_code = 400


class ScanInProgressError(AppError):
    code = "SCAN_IN_PROGRESS"
    status_code = 409


class LLMError(AppError):
    code = "LLM_ERROR"
    status_code = 502


class ConfirmationRequiredError(AppError):
    code = "CONFIRMATION_REQUIRED"
    status_code = 400


def _envelope(code: str, message: str, details: dict | None = None) -> dict:
    return {"error": {"code": code, "message": message, "details": details or {}}}


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def _app_error(request: Request, exc: AppError):  # noqa: ARG001
        return JSONResponse(
            status_code=exc.status_code,
            content=_envelope(exc.code, exc.message, exc.details),
        )

    @app.exception_handler(StarletteHTTPException)
    async def _http_error(request: Request, exc: StarletteHTTPException):  # noqa: ARG001
        # Map common HTTP errors to our standard codes; everything else INTERNAL_ERROR.
        code_map = {
            404: "INTERNAL_ERROR",
            400: "INVALID_ACTION",
            409: "SCAN_IN_PROGRESS",
        }
        code = code_map.get(exc.status_code, "INTERNAL_ERROR")
        return JSONResponse(
            status_code=exc.status_code,
            content=_envelope(code, str(exc.detail)),
        )

    @app.exception_handler(RequestValidationError)
    async def _validation_error(request: Request, exc: RequestValidationError):  # noqa: ARG001
        return JSONResponse(
            status_code=422,
            content=_envelope(
                "INVALID_ACTION",
                "Request validation failed",
                {"errors": jsonable_encoder(exc.errors())},
            ),
        )

    @app.exception_handler(Exception)
    async def _unhandled(request: Request, exc: Exception):  # noqa: ARG001
        return JSONResponse(
            status_code=500,
            content=_envelope("INTERNAL_ERROR", str(exc)),
        )
