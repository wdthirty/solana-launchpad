/**
 * Username Validation
 *
 * Shared validation logic for usernames.
 * Used by both frontend and backend.
 */

/**
 * Reserved usernames that cannot be used (case-insensitive exact match)
 */
const RESERVED_USERNAMES: string[] = [];

/**
 * Check if a username is reserved
 * Only blocks exact matches (case-insensitive), substrings are allowed
 */
export function isReservedUsername(username: string): boolean {
  const normalized = username.trim().toLowerCase();
  return RESERVED_USERNAMES.includes(normalized);
}

/**
 * Validate username and return error message if invalid
 * Returns null if valid
 *
 * Rules:
 * - 1-15 characters
 * - Only letters, numbers, underscores, and dashes allowed
 * - No spaces (use underscores or dashes instead)
 * - Cannot be a reserved username
 */
export function validateUsername(username: string): string | null {
  const trimmed = username.trim();

  if (!trimmed || trimmed.length === 0) {
    return 'Username is required';
  }

  if (trimmed.length > 15) {
    return 'Username must be 15 characters or less';
  }

  // Check for spaces
  if (trimmed.includes(' ')) {
    return 'Username cannot contain spaces. Use underscores or dashes instead';
  }

  // Only allow letters, numbers, underscores, and dashes
  const validUsernameRegex = /^[a-zA-Z0-9_-]+$/;
  if (!validUsernameRegex.test(trimmed)) {
    return 'Username can only contain letters, numbers, underscores, and dashes';
  }

  if (isReservedUsername(trimmed)) {
    return 'This username is reserved';
  }

  return null;
}
