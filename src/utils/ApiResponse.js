export class ApiResponse {
  static success(res, data, message = 'Success', statusCode = 200) {
    return res.status(statusCode).json({
      success: true,
      message,
      data: data ?? null,
    });
  }

  static error(res, message = 'An error occurred', statusCode = 500, errors = null) {
    const body = { success: false, message };
    if (errors) body.errors = errors;
    return res.status(statusCode).json(body);
  }
}