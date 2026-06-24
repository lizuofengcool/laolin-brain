import { NextResponse } from "next/server";

/**
 * API响应工具函数
 * 统一的API响应格式
 */

// 成功响应
export function successResponse(data: any, message?: string, statusCode = 200) {
  return NextResponse.json(
    {
      success: true,
      data,
      message,
    },
    { status: statusCode }
  );
}

// 错误响应
export function errorResponse(error: string, statusCode = 400) {
  return NextResponse.json(
    {
      success: false,
      error,
    },
    { status: statusCode }
  );
}

// 分页响应
export function paginatedResponse(
  data: any[],
  total: number,
  page: number,
  pageSize: number
) {
  const totalPages = Math.ceil(total / pageSize);
  return NextResponse.json({
    data,
    total,
    page,
    pageSize,
    totalPages,
    hasMore: page * pageSize < total,
  });
}

// 未授权响应
export function unauthorizedResponse(message = "未授权访问") {
  return errorResponse(message, 401);
}

// 禁止访问响应
export function forbiddenResponse(message = "没有权限执行此操作") {
  return errorResponse(message, 403);
}

// 未找到响应
export function notFoundResponse(message = "资源不存在") {
  return errorResponse(message, 404);
}

// 服务器错误响应
export function serverErrorResponse(message = "服务器内部错误") {
  return errorResponse(message, 500);
}

// 解析分页参数
export function parsePaginationParams(searchParams: URLSearchParams) {
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const pageSize = Math.min(
    100,
    Math.max(1, parseInt(searchParams.get("pageSize") || "20", 10))
  );
  const skip = (page - 1) * pageSize;
  return { page, pageSize, skip };
}

// 计算分页信息
export function calculatePagination(total: number, page: number, pageSize: number) {
  const totalPages = Math.ceil(total / pageSize);
  return {
    total,
    page,
    pageSize,
    totalPages,
    hasMore: page * pageSize < total,
  };
}
