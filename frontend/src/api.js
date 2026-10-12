
const API_BASE =
  import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, options);

  let data;

  try {
    data = await response.json();
  } catch {
    throw new Error("The backend returned an invalid response.");
  }

  if (!response.ok) {
    throw new Error(
      data.detail || data.message || `Request failed (${response.status})`
    );
  }

  return data;
}

export function chat(message, language, reportContext = "") {
  return request("/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      language,
      report_context: reportContext
    })
  });
}

export function symptomGuidance(message, language) {
  return request("/symptoms", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, language })
  });
}

export function uploadReport(file, question, language) {
  const form = new FormData();
  form.append("file", file);
  form.append("question", question);
  form.append("language", language);

  return request("/upload-report", {
    method: "POST",
    body: form
  });
}

export function analyzeImage(file, question, language) {
  const form = new FormData();
  form.append("file", file);
  form.append("question", question);
  form.append("language", language);

  return request("/analyze-image", {
    method: "POST",
    body: form
  });
}

export function voiceChat(file, language) {
  const form = new FormData();
  form.append("file", file);
  form.append("language", language);

  return request("/voice-chat", {
    method: "POST",
    body: form
  });
}

export function getAppointments() {
  return request("/appointments");
}

export function createAppointment(appointment) {
  return request("/appointments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(appointment)
  });
}

export function deleteAppointment(id) {
  return request(`/appointments/${id}`, {
    method: "DELETE"
  });
}

export function getReminders() {
  return request("/reminders");
}

export function createReminder(reminder) {
  return request("/reminders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(reminder)
  });
}
