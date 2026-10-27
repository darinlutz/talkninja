// The password rules for signing up, resetting a password and the Account
// page's Change Password. Dependency-free so the forms can use it too.
export const MIN_PASSWORD_LENGTH = 8;

// Why a new password isn't allowed, or null when it is
export function passwordProblem(password: string): string | null {
  return password.length < MIN_PASSWORD_LENGTH ? `Password must be at least ${MIN_PASSWORD_LENGTH} characters` : null;
}
