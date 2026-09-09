import { AxiosError } from "axios";

/**
 * Turns an unknown thrown value into something a user can act on.
 *
 * Every data surface in the app funnels failures through here so that the same
 * HTTP status produces the same wording everywhere, and so no raw server text
 * or stack trace reaches the UI by default. The untranslated detail is kept
 * separately in `detail` for the collapsible "technical details" affordance and
 * for logging — it is never the headline.
 */

export type ErrorKind =
  | "network"
  | "timeout"
  | "unauthorized"
  | "forbidden"
  | "notFound"
  | "rateLimited"
  | "server"
  | "client"
  | "unknown";

export interface DescribedError {
  kind: ErrorKind;
  /** Short, human headline. Safe to render directly. */
  title: string;
  /** One or two sentences telling the user what to do next. */
  description: string;
  /** Raw technical text for the details disclosure / console. May be undefined. */
  detail?: string;
  /** HTTP status when the failure came back from the API. */
  status?: number;
  /** False for 4xx that a retry cannot fix, so the UI can hide the retry button. */
  retryable: boolean;
}

function detailOf(error: AxiosError): string | undefined {
  const data = error.response?.data as
    | { message?: unknown; error?: unknown }
    | undefined;
  const fromBody =
    (typeof data?.message === "string" && data.message) ||
    (typeof data?.error === "string" && data.error) ||
    undefined;
  return fromBody ?? error.message ?? undefined;
}

export interface DescribeOptions {
  /**
   * Set on a sign-in / credential submission. A 401 means two different things
   * depending on where it arrives: on a data screen the session lapsed, but on
   * the sign-in form there was no session to lapse — the credentials were
   * simply wrong. Telling someone at the login screen that their "session has
   * expired" and to "sign in again" is advice they are already following.
   */
  credentialAttempt?: boolean;
}

export function describeError(
  error: unknown,
  options: DescribeOptions = {},
): DescribedError {
  if (error instanceof AxiosError) {
    const status = error.response?.status;
    const detail = detailOf(error);

    if (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT") {
      return {
        kind: "timeout",
        title: "The request timed out",
        description:
          "The server took too long to respond. It may be under load — try again in a moment.",
        detail,
        status,
        retryable: true,
      };
    }

    // No response at all: the browser could not reach the API.
    if (!error.response) {
      return {
        kind: "network",
        title: "Can't reach the server",
        description:
          "Check your connection. If you're online, the monitoring API may be temporarily unavailable.",
        detail,
        retryable: true,
      };
    }

    switch (status) {
      case 401:
        return options.credentialAttempt
          ? {
              kind: "unauthorized",
              // Deliberately does not say WHICH half was wrong; the API does not
              // disclose it either, and repeating the distinction in the UI
              // would hand back the enumeration oracle the API just closed.
              title: "Incorrect email or password",
              description:
                "Check the address and password and try again. If you've forgotten it, use the reset link below.",
              detail,
              status,
              retryable: false,
            }
          : {
              kind: "unauthorized",
              title: "Your session has expired",
              description: "Sign in again to continue.",
              detail,
              status,
              retryable: false,
            };
      case 403:
        return {
          kind: "forbidden",
          title: "You don't have access to this",
          description:
            "Your role doesn't permit viewing this data. Contact an administrator if you think that's wrong.",
          detail,
          status,
          retryable: false,
        };
      case 404:
        return {
          kind: "notFound",
          title: "Not found",
          description: "This record may have been removed or renamed.",
          detail,
          status,
          retryable: false,
        };
      case 429:
        return {
          kind: "rateLimited",
          title: "Too many requests",
          description:
            "You've hit the rate limit. Wait a few seconds before trying again.",
          detail,
          status,
          retryable: true,
        };
      default:
        break;
    }

    if (status && status >= 500) {
      return {
        kind: "server",
        title: "The server had a problem",
        description:
          "This isn't your fault. The request failed on our side — try again, and if it keeps happening, contact support.",
        detail,
        status,
        retryable: true,
      };
    }

    return {
      kind: "client",
      title: "That request couldn't be completed",
      description: "Something about the request was rejected by the server.",
      detail,
      status,
      retryable: false,
    };
  }

  return {
    kind: "unknown",
    title: "Something went wrong",
    description:
      "An unexpected error occurred while loading this data. Try again.",
    detail: error instanceof Error ? error.message : undefined,
    retryable: true,
  };
}
