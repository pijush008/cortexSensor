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

/**
 * The message the API itself sent, or undefined.
 *
 * Deliberately NOT detailOf: that falls back to `error.message`, which on a
 * rejected request is axios's own "Request failed with status code 400". Shown
 * to someone filling in a form that is worse than the generic copy, so only a
 * message the server actually wrote qualifies.
 *
 * The guards keep this from becoming a hole that prints whatever a 4xx happens
 * to carry. A body-parser failure, an HTML error page from a proxy, or a stack
 * trace escaping a handler is long or multi-line; a message written for a
 * person is short and one line. Anything else falls through to the generic
 * copy rather than putting server internals on screen.
 */
const MAX_SERVER_MESSAGE = 200;

function serverMessageOf(error: AxiosError): string | undefined {
  const data = error.response?.data as
    | { message?: unknown; error?: unknown }
    | undefined;
  const raw =
    (typeof data?.message === "string" && data.message) ||
    (typeof data?.error === "string" && data.error) ||
    "";
  const text = raw.trim();
  if (text.length === 0 || text.length > MAX_SERVER_MESSAGE) return undefined;
  if (/[\r\n]/.test(text)) return undefined;
  if (/^\s*</.test(text)) return undefined; // an HTML error page, not a sentence
  return text;
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
      case 403: {
        // Not every 403 is about roles. Sign-in raises one for an account
        // whose payment has not been confirmed yet, and answering that with
        // "your role doesn't permit viewing this data" sends someone to an
        // administrator over a step they need to complete themselves.
        //
        // When the API states a reason, that reason is the description; the
        // role wording is only the fallback for a bare 403.
        const fromServer = serverMessageOf(error);
        return {
          kind: "forbidden",
          title:
            fromServer && options.credentialAttempt
              ? "Can't sign in yet"
              : "You don't have access to this",
          description:
            fromServer ??
            "Your role doesn't permit viewing this data. Contact an administrator if you think that's wrong.",
          detail,
          status,
          retryable: false,
        };
      }
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
      // A rejected submission. The API answers these with a message written for
      // the person filling the form — "Email already exists", "Upload a png,
      // jpg, webp image file", "Password must be at least 8 characters" — and
      // that message is the only thing that says what to change.
      //
      // Without these cases they fell to the generic client fallback below, so
      // registration failures read "That request couldn't be completed /
      // Something about the request was rejected by the server": accurate,
      // unactionable, and identical whether the email was taken or the logo was
      // an SVG.
      case 400:
      case 409:
      case 422: {
        const fromServer = serverMessageOf(error);
        if (fromServer) {
          return {
            kind: "client",
            title:
              status === 409
                ? "That already exists"
                : "Check the form and try again",
            description: fromServer,
            detail,
            status,
            retryable: false,
          };
        }
        break;
      }
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
