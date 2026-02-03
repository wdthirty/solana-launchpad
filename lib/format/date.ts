import { DASH } from './number';

/**
 * Formats the given `date` as a relative time string.
 */
export function formatAge(date: Date | undefined | null, now: Date) {
  if (date === undefined || date === null) {
    return DASH;
  }

  // Calculate difference in seconds
  // For past dates: now.getTime() > date.getTime(), so difference is positive
  // Use absolute value to handle any clock skew or edge cases
  const secondsDiff = Math.abs(Math.floor((now.getTime() - date.getTime()) / 1000));

  // Less than 60 secs, we show seconds only
  if (secondsDiff < 60) {
    return `${secondsDiff}s`;
  }

  // Less than 60 mins, we show minutes only
  const minutesDiff = Math.floor(secondsDiff / 60);
  if (minutesDiff < 60) {
    return `${minutesDiff}m`;
  }

  // Less than 24 hours, we show hours only
  const hoursDiff = Math.floor(minutesDiff / 60);
  if (hoursDiff < 24) {
    return `${hoursDiff}h`;
  }

  // More than 24 hours, we show days only
  const daysDiff = Math.floor(hoursDiff / 24);
  return `${daysDiff}d`;
}

export class _IntlDate {
  public readonly locale: string | undefined;

  constructor(locale?: string | undefined) {
    this.locale = locale;
  }

  private toDate(input: Date | string | number): Date | null {
    const date = new Date(input);
    return isNaN(date.valueOf()) ? null : date;
  }

  public toTimezone(
    input: Date | string | number,
    options?: {
      timezone?: string | undefined;
    }
  ): string {
    const date = new Date(input);
    const timeZonePart = new Intl.DateTimeFormat(this.locale, {
      timeZone: options?.timezone,
      timeZoneName: 'short',
    })
      .formatToParts(date)
      .find((part) => part.type == 'timeZoneName');
    return timeZonePart ? timeZonePart.value : '';
  }

  public format(
    inputDate: Date | string | number,
    options?: {
      timezone?: string | undefined;
      withoutDate?: boolean | undefined;
      withoutTime?: boolean | undefined;
      withoutSeconds?: boolean | undefined;
      withoutYear?: boolean | undefined;
      withTimezone?: boolean | undefined;
      hour12?: boolean | undefined;
    }
  ): string {
    const date = this.toDate(inputDate);
    if (date === null) {
      return DASH;
    }
    const datePart = date.toLocaleDateString(this.locale, {
      timeZone: options?.timezone,
      day: 'numeric',
      month: 'short',
      year: options?.withoutYear ? undefined : 'numeric',
      timeZoneName: options?.withoutTime
        ? options?.withTimezone
          ? 'short'
          : undefined
        : undefined,
    });
    const timePart = date.toLocaleTimeString(this.locale, {
      timeZone: options?.timezone,
      hour: '2-digit',
      minute: '2-digit',
      second: options?.withoutSeconds ? undefined : '2-digit',
      timeZoneName: options?.withTimezone ? 'short' : undefined,
      hour12: options?.hour12,
    });
    return options?.withoutDate
      ? timePart
      : options?.withoutTime
        ? datePart
        : `${datePart} ${timePart}`;
  }
}

export const intlDate = new _IntlDate();

/**
 * Formats a date as a relative time string (e.g., "2 hours ago", "3 days ago")
 * @param date - The date to format (can be Date, string, or ISO string)
 * @returns Formatted relative time string
 */
export function formatRelativeTime(date: Date | string | undefined | null): string {
  if (!date) {
    return DASH;
  }

  const dateObj = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(dateObj.getTime())) {
    return DASH;
  }

  const now = new Date();
  const secondsDiff = Math.floor((now.getTime() - dateObj.getTime()) / 1000);

  if (secondsDiff < 0) {
    return 'just now';
  }

  if (secondsDiff < 60) {
    return secondsDiff === 1 ? '1 second ago' : `${secondsDiff} seconds ago`;
  }

  const minutesDiff = Math.floor(secondsDiff / 60);
  if (minutesDiff < 60) {
    return minutesDiff === 1 ? '1 minute ago' : `${minutesDiff} minutes ago`;
  }

  const hoursDiff = Math.floor(minutesDiff / 60);
  if (hoursDiff < 24) {
    return hoursDiff === 1 ? '1 hour ago' : `${hoursDiff} hours ago`;
  }

  const daysDiff = Math.floor(hoursDiff / 24);
  if (daysDiff < 7) {
    return daysDiff === 1 ? '1 day ago' : `${daysDiff} days ago`;
  }

  const weeksDiff = Math.floor(daysDiff / 7);
  if (daysDiff < 30) {
    return weeksDiff === 1 ? '1 week ago' : `${weeksDiff} weeks ago`;
  }

  const monthsDiff = Math.floor(daysDiff / 30);
  if (monthsDiff < 12) {
    return monthsDiff === 1 ? '1 month ago' : `${monthsDiff} months ago`;
  }

  const yearsDiff = Math.floor(daysDiff / 365);
  return yearsDiff === 1 ? '1 year ago' : `${yearsDiff} years ago`;
}
