// Values of users.role. Dependency-free so client components can use it.
// Subscriptions are tracked separately, in account_status.
export const ROLES = {
  admin: 'Admin',
  user: 'User',
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

export const ROLE_VALUES: readonly Role[] = [ROLES.admin, ROLES.user];

export const isRole = (value: unknown): value is Role => ROLE_VALUES.includes(value as Role);

export const isAdmin = (role: string | null | undefined) => role === ROLES.admin;

// The site owner's account, which is always Admin (matched ignoring case):
// ensureUserSchema promotes it and createUser makes it Admin if it signs up
// again. Other roles are only changed on the Admin page's User Roles section.
export const OWNER_EMAIL = 'darinlutz@yahoo.com';

export const isOwnerEmail = (emailAddress: string) => emailAddress.trim().toLowerCase() === OWNER_EMAIL;
