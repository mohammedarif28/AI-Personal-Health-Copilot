import React, { useEffect, useState } from "react";
import {
    Search,
    Pill,
    Upload,
    FileText,
    Clock,
    ShieldCheck,
    AlertCircle,
    X,
} from "lucide-react";
import "./MediLensDashboard.css";

export default function MediLensDashboard() {
    const [medicineName, setMedicineName] = useState("");
    const [medicineImage, setMedicineImage] = useState(null);
    const [result, setResult] = useState(null);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const [recentSearches, setRecentSearches] = useState(() => {
        try {
            const saved = localStorage.getItem("medilens_search_history");
            const parsed = saved ? JSON.parse(saved) : [];

            return Array.isArray(parsed)
                ? parsed.filter((item) => typeof item === "string")
                : [];
        } catch {
            return [];
        }
    });
    useEffect(() => {
        localStorage.setItem(
            "medilens_search_history",
            JSON.stringify(recentSearches)
        );
    }, [recentSearches]);

    async function searchMedicine(event) {
        event.preventDefault();

        if (!medicineName.trim() && !medicineImage) {
            setError("Enter a medicine name or select an image.");
            return;
        }

        setLoading(true);
        setError("");
        setResult(null);

        try {
            const response = await fetch(
                `${import.meta.env.VITE_API_BASE_URL || "http://localhost:8000"}/medicine-decoder`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        medicine_name: medicineName.trim(),
                    }),
                }
            );
            const data = await response.json();

            if (!response.ok) {
                const detail = data.detail;

                const message = Array.isArray(detail)
                    ? detail.map((item) => item.msg || JSON.stringify(item)).join(", ")
                    : typeof detail === "string"
                        ? detail
                        : detail
                            ? JSON.stringify(detail)
                            : "Unable to retrieve medicine information.";

                throw new Error(message);
            }

            setResult(data);

            if (medicineName.trim() && data.found !== false) {
                setRecentSearches((previous) => [
                    medicineName.trim(),
                    ...previous.filter(
                        (item) =>
                            item.toLowerCase() !== medicineName.trim().toLowerCase()
                    ),
                ].slice(0, 20));
            }
        } catch (err) {
            setError(
                err.message ||
                "Could not connect to the medicine information service."
            );
        } finally {
            setLoading(false);
        }
    }

    function resetSearch() {
        setMedicineName("");
        setMedicineImage(null);
        setResult(null);
        setError("");
    }

    return (
        <section className="medilens-dashboard">
            <div className="medilens-hero">
                <div className="medilens-hero-icon">
                    <Pill size={30} />
                </div>

                <span className="medilens-eyebrow">MEDICINE INTELLIGENCE</span>

                <h2>Understand your medicines better.</h2>

                <p>
                    Search for a medicine to explore its available information.
                    You can also select a medicine package image.
                </p>

                <form
                    className="medilens-search-form"
                    onSubmit={searchMedicine}
                >
                    <div className="medilens-search-input">
                        <Search size={20} />

                        <input
                            value={medicineName}
                            onChange={(event) => setMedicineName(event.target.value)}
                            placeholder="Enter medicine name..."
                            aria-label="Medicine name"
                        />

                        {medicineName && (
                            <button
                                type="button"
                                className="medilens-clear-button"
                                onClick={() => setMedicineName("")}
                                aria-label="Clear medicine name"
                            >
                                <X size={17} />
                            </button>
                        )}
                    </div>

                    <label className="medilens-upload-button">
                        <Upload size={18} />
                        <span>{medicineImage ? "Change image" : "Upload image"}</span>

                        <input
                            type="file"
                            accept="image/*"
                            hidden
                            onChange={(event) => {
                                setMedicineImage(event.target.files?.[0] || null);
                                setError("");
                            }}
                        />
                    </label>

                    <button
                        className="medilens-search-button"
                        type="submit"
                        disabled={loading}
                    >
                        {loading ? "Searching..." : "Search medicine"}
                    </button>
                </form>

                {medicineImage && (
                    <div className="medilens-selected-file">
                        <FileText size={17} />
                        <span>{medicineImage.name}</span>
                        <button
                            type="button"
                            onClick={() => setMedicineImage(null)}
                            aria-label="Remove selected image"
                        >
                            <X size={16} />
                        </button>
                    </div>
                )}

                {error && (
                    <div className="medilens-error" role="alert">
                        <AlertCircle size={19} />
                        <span>{error}</span>
                    </div>
                )}
            </div>


            {result && (
                <div className="medilens-result">
                    <div className="medilens-result-heading">
                        <div>
                            <span className="medilens-eyebrow">SEARCH RESULT</span>
                            <h3>
                                {result.medicine_name || medicineName || "Medicine information"}
                            </h3>
                        </div>

                        <button
                            type="button"
                            className="medilens-reset-button"
                            onClick={resetSearch}
                        >
                            New search
                        </button>
                    </div>

                    {result.found === false ? (
                        <p>
                            No matching medicine information was found. Check the spelling
                            or try the medicine's generic name.
                        </p>
                    ) : (
                        <div className="medilens-result-content">
                            {result.answer && (
                                <div className="medilens-answer">
                                    <div className="medilens-answer-heading">
                                        <h4>Medicine information</h4>
                                    </div>

                                    <div className="medilens-answer-text">
                                        {result.answer.split("\n").map((line, index) => {
                                            const trimmedLine = line.trim();

                                            if (!trimmedLine) return null;

                                            if (
                                                trimmedLine.startsWith("**") &&
                                                trimmedLine.endsWith("**")
                                            ) {
                                                return (
                                                    <h4 key={index}>
                                                        {trimmedLine.replace(/\*\*/g, "")}
                                                    </h4>
                                                );
                                            }

                                            if (trimmedLine.startsWith("- ")) {
                                                return (
                                                    <p
                                                        className="medilens-answer-bullet"
                                                        key={index}
                                                    >
                                                        • {trimmedLine.substring(2).replace(/\*\*/g, "")}
                                                    </p>
                                                );
                                            }

                                            return (
                                                <p key={index}>
                                                    {trimmedLine.replace(/\*\*/g, "")}
                                                </p>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            <div className="medilens-source">
                                <strong>Official information resources</strong>
                                <ul>
                                    <li>
                                        <a
                                            href="https://www.accessdata.fda.gov/scripts/cder/daf/"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                        >
                                            U.S. FDA — Drug Labels
                                        </a>
                                    </li>
                                    <li>
                                        <a
                                            href="https://cdsco.gov.in/opencms/opencms/en/Home/"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                        >
                                            CDSCO — India
                                        </a>
                                    </li>
                                    <li>
                                        <a
                                            href="https://medlineplus.gov/druginformation.html"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                        >
                                            MedlinePlus — Drug Information
                                        </a>
                                    </li>
                                </ul>

                                <p>
                                    Confirm the exact medicine, strength, and instructions
                                    with a pharmacist or doctor.
                                </p>
                            </div>

                            {!result.answer && (
                                <p>No medicine summary was returned.</p>
                            )}
                        </div>
                    )}

                    <p className="medilens-disclaimer">
                        <ShieldCheck size={17} />
                        Verify medicine details with a pharmacist or doctor before
                        making treatment decisions.
                    </p>
                </div>
            )}



            {recentSearches.length > 0 && (
                <div className="medilens-recent">
                    <h3>Medicine search history</h3>

                    {recentSearches.map((name) => (
                        <button
                            type="button"
                            className="medilens-recent-item"
                            key={name}
                            onClick={() => {
                                setMedicineName(name);
                                setMedicineImage(null);
                                setError("");
                                setResult(null);
                            }}
                        >
                            <Clock size={17} />
                            <span>{name}</span>
                            <Search size={16} />
                        </button>
                    ))}
                </div>
            )}
        </section>
    );
}
