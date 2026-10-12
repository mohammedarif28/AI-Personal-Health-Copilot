
import React, { useEffect, useRef, useState } from "react";
import {
  Activity,
  Bot,
  CalendarDays,
  FileText,
  Image as ImageIcon,
  Mic,
  Plus,
  Send,
  ShieldCheck,
  Stethoscope,
  Trash2,
  User,
  MessageCircle,
  Pencil,
  X,
  MessageSquare,
} from "lucide-react";

const API_BASE = "http://127.0.0.1:8000";
const STORAGE_KEY = "health-copilot-conversations-v1";

const createId = () =>
  `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

const welcomeMessage = {
  role: "assistant",
  content:
    "Hello! I'm Health Copilot. Ask me a health question, or upload a medical report for a simple explanation. How can I help you today?",
};

function createConversation() {
  return {
    id: createId(),
    title: "New chat",
    messages: [{ ...welcomeMessage }],
    updatedAt: Date.now(),
  };
}

function loadSavedChats() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return null;

    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed) || parsed.length === 0) return null;

    return parsed
      .filter((chat) => chat && chat.id && Array.isArray(chat.messages))
      .map((chat) => ({
        id: String(chat.id),
        title: String(chat.title || "New chat"),
        messages: chat.messages,
        updatedAt: Number(chat.updatedAt) || Date.now(),
      }));
  } catch {
    return null;
  }
}

async function apiRequest(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, options);
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      data.detail || data.message || `Request failed (${response.status})`
    );
  }

  return data;
}

function getAnswer(data) {
  return (
    data.answer ||
    data.response ||
    data.result ||
    data.message ||
    "I couldn't generate a response. Please try again."
  );
}

function formatChatDate(timestamp) {
  const date = new Date(timestamp);
  const today = new Date();

  if (date.toDateString() === today.toDateString()) {
    return date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return date.toLocaleDateString([], {
    month: "short",
    day: "numeric",
  });
}

export default function App() {
  const [initialChats] = useState(() => {
    const saved = loadSavedChats();
    return saved || [createConversation()];
  });

  const [conversations, setConversations] = useState(initialChats);
  const [activeChatId, setActiveChatId] = useState(initialChats[0].id);
  const [activePage, setActivePage] = useState("chat");
  const [language, setLanguage] = useState("Auto-detect");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);

  const [appointments, setAppointments] = useState([]);
  const [reminders, setReminders] = useState([]);
  const [doctor, setDoctor] = useState("");
  const [appointmentDate, setAppointmentDate] = useState("");
  const [appointmentNotes, setAppointmentNotes] = useState("");
  const [medicine, setMedicine] = useState("");
  const [schedule, setSchedule] = useState("");
  const [reminderNotes, setReminderNotes] = useState("");
  const [symptoms, setSymptoms] = useState("");
  const [recording, setRecording] = useState(false);

  const messagesEndRef = useRef(null);
  const reportInputRef = useRef(null);
  const imageInputRef = useRef(null);
  const recorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const streamRef = useRef(null);

  const activeChat =
    conversations.find((chat) => chat.id === activeChatId) ||
    conversations[0];

  const messages = activeChat?.messages || [];

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
    } catch {
      setError(
        "Chat history could not be saved. Your browser storage may be full."
      );
    }
  }, [conversations]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading, activeChatId]);

  useEffect(() => {
    loadAppointments();
    loadReminders();

    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  function updateActiveMessages(nextMessages, firstUserMessage = "") {
    setConversations((previous) =>
      previous.map((chat) => {
        if (chat.id !== activeChatId) return chat;

        let title = chat.title;

        if (firstUserMessage && title === "New chat") {
          title =
            firstUserMessage.length > 35
              ? firstUserMessage.slice(0, 35).trimEnd() + "…"
              : firstUserMessage;
        }

        return {
          ...chat,
          title,
          messages: nextMessages,
          updatedAt: Date.now(),
        };
      })
    );
  }

  function addMessage(role, content) {
    const current = conversations.find((chat) => chat.id === activeChatId);
    if (!current) return;

    const nextMessages = [...current.messages, { role, content }];
    updateActiveMessages(
      nextMessages,
      role === "user" ? content : ""
    );
  }

  function startNewChat() {
    const chat = createConversation();
    setConversations((previous) => [chat, ...previous]);
    setActiveChatId(chat.id);
    setActivePage("chat");
    setMessage("");
    setError("");
  }

  function openChat(chatId) {
    setActiveChatId(chatId);
    setActivePage("chat");
    setMessage("");
    setError("");
  }

  function deleteChat(chatId) {
    const chat = conversations.find((item) => item.id === chatId);
    if (!chat) return;

    if (
      !window.confirm(
        `Delete "${chat.title}"? This conversation will be permanently removed from this browser.`
      )
    ) {
      return;
    }

    const remaining = conversations.filter((item) => item.id !== chatId);

    if (remaining.length === 0) {
      const newChat = createConversation();
      setConversations([newChat]);
      setActiveChatId(newChat.id);
    } else {
      setConversations(remaining);

      if (activeChatId === chatId) {
        setActiveChatId(remaining[0].id);
      }
    }

    setMessage("");
    setError("");
  }

  function renameChat(chatId) {
    const chat = conversations.find((item) => item.id === chatId);
    if (!chat) return;

    const name = window.prompt("Enter a name for this chat:", chat.title);
    if (name === null || !name.trim()) return;

    setConversations((previous) =>
      previous.map((item) =>
        item.id === chatId
          ? { ...item, title: name.trim().slice(0, 80) }
          : item
      )
    );
  }

  async function loadAppointments() {
    try {
      const data = await apiRequest("/appointments");
      setAppointments(Array.isArray(data) ? data : data.appointments || []);
    } catch {
      setAppointments([]);
    }
  }

  async function loadReminders() {
    try {
      const data = await apiRequest("/reminders");
      setReminders(Array.isArray(data) ? data : data.reminders || []);
    } catch {
      setReminders([]);
    }
  }

  async function sendMessage(event) {
    event?.preventDefault();

    const question = message.trim();
    if (!question || loading) return;

    setError("");
    setMessage("");
    addMessage("user", question);
    setLoading(true);

    try {
      const data = await apiRequest("/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: question,
          language,
          report_context: "",
        }),
      });

      addMessage("assistant", getAnswer(data));
    } catch (err) {
      setError(err.message || "Unable to connect to Health Copilot.");
      addMessage(
        "assistant",
        "I'm unable to respond right now. Please check that the backend is running and try again."
      );
    } finally {
      setLoading(false);
    }
  }

  async function uploadFile(file, type) {
    if (!file) return;

    setError("");
    setUploading(true);
    setLoading(true);

    const isReport = type === "report";
    const question = isReport
      ? "Explain this medical report in simple words. Summarize important findings and values outside the provided reference ranges."
      : "Describe what is visible in this image in simple words. Do not make a diagnosis from the image.";

    addMessage(
      "user",
      `${isReport ? "Medical report" : "Medical image"} uploaded: ${file.name}`
    );

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("question", question);
      formData.append("language", language);

      const endpoint = isReport ? "/upload-report" : "/analyze-image";
      const data = await apiRequest(endpoint, {
        method: "POST",
        body: formData,
      });

      addMessage("assistant", getAnswer(data));
    } catch (err) {
      setError(err.message || "Unable to analyze the uploaded file.");
      addMessage(
        "assistant",
        "I couldn't process that file. Check that the backend is running and that the file format is supported."
      );
    } finally {
      setLoading(false);
      setUploading(false);
      if (reportInputRef.current) reportInputRef.current.value = "";
      if (imageInputRef.current) imageInputRef.current.value = "";
    }
  }

  async function checkSymptoms(event) {
    event.preventDefault();

    const text = symptoms.trim();
    if (!text || loading) return;

    setError("");
    addMessage("user", `My symptoms: ${text}`);
    setSymptoms("");
    setLoading(true);

    try {
      const data = await apiRequest("/symptoms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symptoms: text,
          message: text,
          language,
        }),
      });

      addMessage("assistant", getAnswer(data));
      setActivePage("chat");
    } catch (err) {
      setError(err.message || "Unable to check your symptoms.");
    } finally {
      setLoading(false);
    }
  }

  async function startVoiceInput() {
    setError("");

    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setError("Voice recording is not supported by this browser.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });

      streamRef.current = stream;
      audioChunksRef.current = [];

      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      recorder.onstop = async () => {
        const blob = new Blob(audioChunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });

        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;

        const extension = blob.type.includes("ogg")
          ? "ogg"
          : blob.type.includes("mp4")
            ? "mp4"
            : "webm";

        const audioFile = new File([blob], `voice-input.${extension}`, {
          type: blob.type,
        });

        await submitVoice(audioFile);
      };

      recorder.start();
      setRecording(true);
    } catch {
      setError("Microphone access was denied or is unavailable.");
    }
  }

  function stopVoiceInput() {
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.stop();
    }
    setRecording(false);
  }

  async function submitVoice(audioFile) {
    setError("");
    setLoading(true);
    addMessage("user", "Voice message submitted");

    try {
      const formData = new FormData();
      formData.append("file", audioFile);
      formData.append("language", language);

      const data = await apiRequest("/voice-chat", {
        method: "POST",
        body: formData,
      });

      const transcript = data.transcription || data.transcript || "";

      if (transcript) addMessage("assistant", `I heard: "${transcript}"`);
      addMessage("assistant", getAnswer(data));
    } catch (err) {
      setError(err.message || "Unable to process the recording.");
    } finally {
      setLoading(false);
    }
  }

  async function addAppointment(event) {
    event.preventDefault();
    setError("");

    try {
      await apiRequest("/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          doctor,
          appointment_date: appointmentDate,
          notes: appointmentNotes,
        }),
      });

      setDoctor("");
      setAppointmentDate("");
      setAppointmentNotes("");
      await loadAppointments();
    } catch (err) {
      setError(err.message || "Unable to save the appointment.");
    }
  }

  async function deleteAppointment(id) {
    setError("");

    try {
      await apiRequest(`/appointments/${id}`, { method: "DELETE" });
      await loadAppointments();
    } catch (err) {
      setError(err.message || "Unable to delete the appointment.");
    }
  }

  async function addReminder(event) {
    event.preventDefault();
    setError("");

    try {
      await apiRequest("/reminders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          medicine,
          schedule,
          notes: reminderNotes,
        }),
      });

      setMedicine("");
      setSchedule("");
      setReminderNotes("");
      await loadReminders();
    } catch (err) {
      setError(err.message || "Unable to save the reminder.");
    }
  }

  async function deleteReminder(id) {
    setError("");

    try {
      await apiRequest(`/reminders/${id}`, { method: "DELETE" });
      await loadReminders();
    } catch (err) {
      setError(err.message || "Unable to delete the reminder.");
    }
  }

  const pageDetails = {
    chat: {
      title: "Health Chat",
      subtitle: "Understand health information with greater clarity.",
    },
    symptoms: {
      title: "Symptom Checker",
      subtitle: "Describe how you feel to receive general health information.",
    },
    appointments: {
      title: "Appointments",
      subtitle: "Keep your healthcare appointments organized.",
    },
    reminders: {
      title: "Medicine Reminders",
      subtitle: "Keep a record of your medicine schedules.",
    },
  };

  const currentPage = pageDetails[activePage];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">
            <Activity size={27} />
          </div>
          <div>
            <h2>Health Copilot</h2>
            <p>Personal health assistant</p>
          </div>
        </div>

        <div className="sidebar-label">WORKSPACE</div>

        <nav className="sidebar-nav">
          <button
            className={`nav-item ${activePage === "chat" ? "active" : ""}`}
            onClick={() => setActivePage("chat")}
          >
            <Bot size={20} /> Health Chat
          </button>

          <button
            className={`nav-item ${activePage === "symptoms" ? "active" : ""}`}
            onClick={() => setActivePage("symptoms")}
          >
            <Stethoscope size={20} /> Symptoms
          </button>

          <button
            className={`nav-item ${activePage === "appointments" ? "active" : ""}`}
            onClick={() => setActivePage("appointments")}
          >
            <CalendarDays size={20} /> Appointments
          </button>

          <button
            className={`nav-item ${activePage === "reminders" ? "active" : ""}`}
            onClick={() => setActivePage("reminders")}
          >
            <Activity size={20} /> Medicine Reminders
          </button>
        </nav>

        <div className="history-heading">
          <span>RECENT CHATS</span>
          <button
            type="button"
            className="history-add"
            onClick={startNewChat}
            title="Start a new chat"
            aria-label="Start a new chat"
          >
            <Plus size={18} />
          </button>
        </div>

        <div className="chat-history-list">
          {conversations.map((chat) => (
            <div
              key={chat.id}
              className={`history-item ${activeChatId === chat.id && activePage === "chat" ? "selected" : ""}`}
            >
              <button
                className="history-open"
                onClick={() => openChat(chat.id)}
                title={chat.title}
              >
                <MessageSquare size={16} />
                <span>{chat.title}</span>
              </button>

              <div className="history-actions">
                <button
                  type="button"
                  onClick={() => renameChat(chat.id)}
                  title="Rename chat"
                  aria-label={`Rename ${chat.title}`}
                >
                  <Pencil size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => deleteChat(chat.id)}
                  title="Delete chat"
                  aria-label={`Delete ${chat.title}`}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="sidebar-notice">
          <ShieldCheck size={22} />
          <strong>Your health matters</strong>
          <p>
            Use this assistant for general information, not as a substitute
            for professional medical care.
          </p>
        </div>
      </aside>

      <main className="main-content">
        <header className="page-header">
          <div>
            <h1>{currentPage.title}</h1>
            <p>{currentPage.subtitle}</p>
          </div>

          <label className="language-control">
            <span>Response language</span>
            <select
              value={language}
              onChange={(event) => setLanguage(event.target.value)}
            >
              <option>Auto-detect</option>
              <option>English</option>
              <option>Tamil</option>
              <option>Hindi</option>
              <option>Telugu</option>
              <option>Malayalam</option>
              <option>Kannada</option>
            </select>
          </label>
        </header>

        {error && (
          <div className="error-banner" role="alert">
            <span>{error}</span>
            <button onClick={() => setError("")} aria-label="Dismiss error">
              <X size={18} />
            </button>
          </div>
        )}

        {activePage === "chat" && (
          <section className="chat-panel">
            <div className="chat-messages">
              {messages.map((item, index) => (
                <div
                  className={`message-row ${item.role === "user" ? "user-message" : "assistant-message"}`}
                  key={`${activeChatId}-${index}`}
                >
                  <div className="message-avatar">
                    {item.role === "user" ? (
                      <User size={20} />
                    ) : (
                      <Bot size={20} />
                    )}
                  </div>

                  <div className="message-content">
                    <strong>
                      {item.role === "user" ? "You" : "Health Copilot"}
                    </strong>
                    <div className="message-text">{item.content}</div>
                  </div>
                </div>
              ))}

              {loading && (
                <div className="message-row assistant-message">
                  <div className="message-avatar">
                    <Bot size={20} />
                  </div>
                  <div className="message-content">
                    <strong>Health Copilot</strong>
                    <p>Thinking...</p>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            <div className="chat-composer">
              <div className="composer-tools">
                <button
                  type="button"
                  className="tool-button"
                  onClick={() => reportInputRef.current?.click()}
                  disabled={loading || uploading}
                >
                  <FileText size={18} /> Report
                </button>

                <button
                  type="button"
                  className="tool-button"
                  onClick={() => imageInputRef.current?.click()}
                  disabled={loading || uploading}
                >
                  <ImageIcon size={18} /> Medical image
                </button>

                <button
                  type="button"
                  className={`tool-button ${recording ? "recording" : ""}`}
                  onClick={recording ? stopVoiceInput : startVoiceInput}
                  disabled={loading}
                >
                  <Mic size={18} />
                  {recording ? "Stop recording" : "Voice input"}
                </button>

                <button
                  type="button"
                  className="tool-button clear-button"
                  onClick={startNewChat}
                  disabled={loading}
                >
                  <Plus size={18} /> New chat
                </button>
              </div>

              <input
                ref={reportInputRef}
                type="file"
                accept=".pdf,.txt,.md"
                hidden
                onChange={(event) =>
                  uploadFile(event.target.files?.[0], "report")
                }
              />

              <input
                ref={imageInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                hidden
                onChange={(event) =>
                  uploadFile(event.target.files?.[0], "image")
                }
              />

              <form className="message-form" onSubmit={sendMessage}>
                <textarea
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  placeholder="Ask a health question..."
                  rows={2}
                  disabled={loading}
                  onKeyDown={(event) => {
                    if (
                      event.key === "Enter" &&
                      !event.shiftKey &&
                      !event.nativeEvent.isComposing
                    ) {
                      event.preventDefault();
                      sendMessage();
                    }
                  }}
                />

                <button
                  type="submit"
                  className="send-button"
                  disabled={!message.trim() || loading}
                  aria-label="Send message"
                >
                  <Send size={21} />
                </button>
              </form>

              <p className="chat-disclaimer">
                For general information only. Seek professional medical advice
                when needed. For emergencies, contact local emergency services.
              </p>
            </div>
          </section>
        )}

        {activePage === "symptoms" && (
          <section className="content-panel">
            <div className="section-heading">
              <Stethoscope size={24} />
              <h2>Describe your symptoms</h2>
            </div>
            <p>
              Tell Health Copilot what you are experiencing, when it started,
              and how severe it feels.
            </p>

            <form
              onSubmit={checkSymptoms}
              className="form-stack"
            >
              <label htmlFor="symptoms">Your symptoms</label>
              <textarea
                id="symptoms"
                value={symptoms}
                onChange={(event) => setSymptoms(event.target.value)}
                placeholder="Describe what you are experiencing..."
                rows={5}
                required
              />
              <button
                type="submit"
                className="primary-button"
                disabled={loading || !symptoms.trim()}
              >
                Check symptoms
              </button>
            </form>

            <p className="muted-text">
              This tool provides general information, not a medical diagnosis.
            </p>
          </section>
        )}

        {activePage === "appointments" && (
          <section className="content-panel">
            <div className="section-heading">
              <CalendarDays size={24} />
              <h2>Manage appointments</h2>
            </div>

            <form onSubmit={addAppointment} className="form-stack">
              <label htmlFor="doctor">Doctor or clinic</label>
              <input
                id="doctor"
                value={doctor}
                onChange={(event) => setDoctor(event.target.value)}
                placeholder="Doctor or clinic name"
                required
              />

              <label htmlFor="appointment-date">Date and time</label>
              <input
                id="appointment-date"
                type="datetime-local"
                value={appointmentDate}
                onChange={(event) => setAppointmentDate(event.target.value)}
                required
              />

              <label htmlFor="appointment-notes">Notes (optional)</label>
              <textarea
                id="appointment-notes"
                value={appointmentNotes}
                onChange={(event) => setAppointmentNotes(event.target.value)}
                placeholder="Reason for appointment or other notes"
                rows={3}
              />

              <button type="submit" className="primary-button">
                Save appointment
              </button>
            </form>

            <h3 className="list-heading">Saved appointments</h3>

            {appointments.length === 0 ? (
              <p className="muted-text">No appointments saved yet.</p>
            ) : (
              <div className="saved-list">
                {appointments.map((item, index) => (
                  <div className="saved-item" key={item.id ?? index}>
                    <div>
                      <strong>{item.doctor || item.clinic || "Appointment"}</strong>
                      <p>{item.appointment_date || item.date || ""}</p>
                      {item.notes && <p>{item.notes}</p>}
                    </div>
                    {item.id != null && (
                      <button
                        className="icon-button"
                        onClick={() => deleteAppointment(item.id)}
                        aria-label="Delete appointment"
                      >
                        <Trash2 size={18} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {activePage === "reminders" && (
          <section className="content-panel">
            <div className="section-heading">
              <Activity size={24} />
              <h2>Medicine reminders</h2>
            </div>

            <p>
              Save medicine names and schedules for reference. This version
              stores reminders but does not send automatic notifications.
            </p>

            <form onSubmit={addReminder} className="form-stack">
              <label htmlFor="medicine">Medicine name</label>
              <input
                id="medicine"
                value={medicine}
                onChange={(event) => setMedicine(event.target.value)}
                placeholder="Enter the medicine name"
                required
              />

              <label htmlFor="schedule">Schedule</label>
              <input
                id="schedule"
                value={schedule}
                onChange={(event) => setSchedule(event.target.value)}
                placeholder="As directed by your healthcare professional"
                required
              />

              <label htmlFor="reminder-notes">Notes (optional)</label>
              <textarea
                id="reminder-notes"
                value={reminderNotes}
                onChange={(event) => setReminderNotes(event.target.value)}
                placeholder="Additional notes"
                rows={3}
              />

              <button type="submit" className="primary-button">
                Save reminder
              </button>
            </form>

            <h3 className="list-heading">Saved reminders</h3>

            {reminders.length === 0 ? (
              <p className="muted-text">No reminders saved yet.</p>
            ) : (
              <div className="saved-list">
                {reminders.map((item, index) => (
                  <div className="saved-item" key={item.id ?? index}>
                    <div>
                      <strong>{item.medicine || "Medicine"}</strong>
                      <p>{item.schedule || ""}</p>
                      {item.notes && <p>{item.notes}</p>}
                    </div>
                    {item.id != null && (
                      <button
                        className="icon-button"
                        onClick={() => deleteReminder(item.id)}
                        aria-label="Delete reminder"
                      >
                        <Trash2 size={18} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
