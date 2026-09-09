import { UserRole } from "@prisma/client";

export interface JwtPayload {
  userId: number;
  iat?: number;
  exp?: number;
}

export interface AuthenticatedRequestUser {
  id: number;
  userType: UserRole;
  parentId: number;
  firstName: string;
  lastName: string;
  emailId: string;
  status: boolean;
  // convenience: organization/tenant id derived from parentId
  organizationId?: number;
}

export interface PaginationQuery {
  page?: number;
  limit?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}
