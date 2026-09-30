// Contact submission against the Med Robots API: POST /api/v1/contacts.
// The endpoint must be relative so the same code works behind the Vite dev
// proxy locally and behind the production reverse proxy.
export const CONTACT_ENDPOINT = "/api/v1/contacts";

export const contactFields = [
  {
    name: "firstName",
    type: "text",
    autoComplete: "given-name",
    maxLength: 100,
    required: true,
    fullWidth: false,
  },
  {
    name: "lastName",
    type: "text",
    autoComplete: "family-name",
    maxLength: 100,
    required: true,
    fullWidth: false,
  },
  {
    name: "email",
    type: "email",
    autoComplete: "email",
    maxLength: 254,
    required: true,
    fullWidth: false,
  },
  {
    name: "phone",
    type: "tel",
    autoComplete: "tel",
    maxLength: 40,
    required: false,
    fullWidth: false,
  },
  {
    name: "address",
    type: "text",
    autoComplete: "street-address",
    maxLength: 255,
    required: false,
    fullWidth: true,
  },
  {
    name: "message",
    type: "textarea",
    autoComplete: "off",
    maxLength: 5000,
    required: true,
    fullWidth: true,
  },
];

export const emptyContact = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  address: "",
  message: "",
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function validateContact(values) {
  const errors = {};
  if (!values.firstName?.trim()) errors.firstName = "requiredError";
  if (!values.lastName?.trim()) errors.lastName = "requiredError";
  if (!EMAIL_PATTERN.test(values.email.trim()))
    errors.email = "emailError";
  if (!values.message?.trim()) errors.message = "requiredError";
  return errors;
}

// Maps camelCase UI values to the snake_case API contract. Empty optional
// fields are sent as null (the API expects string | null).
export function toApiPayload(values) {
  return {
    first_name: values.firstName.trim(),
    last_name: values.lastName.trim(),
    email: values.email.trim(),
    phone: values.phone.trim() || null,
    address: values.address.trim() || null,
    message: values.message.trim(),
  };
}

// Backend error codes → i18n keys (see src/data/site.js).
const ERROR_KEYS = {
  validation_error: "validationError",
  origin_not_allowed: "forbidden",
  request_too_large: "tooLarge",
  rate_limit_exceeded: "rateLimited",
  internal_error: "serverError",
  database_unavailable: "serviceUnavailable",
  http_error: "serverError",
};

// 422 details use API field paths like "body.first_name"; map them back to
// UI field names so the error can be attached to the affected input.
const API_FIELD_TO_UI = {
  first_name: "firstName",
  last_name: "lastName",
  email: "email",
  phone: "phone",
  address: "address",
  message: "message",
};

export function mapApiError(status, body) {
  if (status === 422 && Array.isArray(body?.error?.details)) {
    const fields = {};
    for (const detail of body.error.details) {
      const apiField = String(detail?.field || "")
        .split(".")
        .pop();
      const uiField = API_FIELD_TO_UI[apiField];
      if (uiField && !fields[uiField])
        fields[uiField] = detail?.message || "validationError";
    }
    return { kind: "validationError", fields };
  }
  const code = body?.error?.code;
  const statusKey = {
    403: "forbidden",
    413: "tooLarge",
    422: "validationError",
    429: "rateLimited",
    503: "serviceUnavailable",
  }[status];
  return {
    kind: ERROR_KEYS[code] || statusKey || (status >= 500 ? "serverError" : "error"),
  };
}

function randomUuid() {
  return globalThis.crypto.randomUUID();
}

const TIMEOUT_MS = 15000;

/**
 * Submits the contact form to /api/v1/contacts.
 * @param {string} endpoint relative endpoint path
 * @param {object} values camelCase form values
 * @param {Function} fetcher injectable fetch (for tests)
 * @param {string} idempotencyKey stable UUID reused across retries of the
 *   same submission (e.g. a double click or a client-side retry)
 */
export async function sendContact(
  endpoint,
  values,
  fetcher = fetch,
  idempotencyKey = randomUuid(),
) {
  if (!endpoint) throw new Error("SUBMISSION NOT AVAILABLE");
  if (!endpoint.startsWith("/") || endpoint.startsWith("//"))
    throw new Error("A same-origin endpoint is required");

  let response;
  try {
    response = await fetcher(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
        "X-Request-ID": randomUuid(),
      },
      body: JSON.stringify(toApiPayload(values)),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (cause) {
    const error = new Error("Submission failed", { cause });
    error.mapped = {
      kind: cause?.name === "TimeoutError" ? "timeout" : "networkError",
    };
    throw error;
  }

  let body = null;
  try {
    body = await response.json();
  } catch {
    // Non-JSON body (proxy error page, empty 502, ...): fall through.
  }

  if (
    response.status === 201 &&
    Number.isInteger(body?.id) &&
    typeof body?.status === "string" &&
    typeof body?.created_at === "string"
  )
    return { id: body.id, status: body.status, createdAt: body.created_at };

  const mapped = mapApiError(response.status, body);
  const error = new Error("Submission failed");
  error.mapped = mapped;
  throw error;
}
