class ApiError(Exception):
    """Lỗi nghiệp vụ trả về cho giao diện kèm mã HTTP."""

    def __init__(self, message: str, status_code: int = 400):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


def not_found(message: str = "Không tìm thấy dữ liệu.") -> ApiError:
    return ApiError(message, 404)


def forbidden(message: str = "Bạn không có quyền thực hiện thao tác này.") -> ApiError:
    return ApiError(message, 403)


def conflict(message: str) -> ApiError:
    return ApiError(message, 409)
