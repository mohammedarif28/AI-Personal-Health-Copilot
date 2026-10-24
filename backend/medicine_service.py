import json
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


FDA_LABEL_URL = "https://api.fda.gov/drug/label.json"




def search_medicine(medicine_name: str) -> dict:
    """Search openFDA drug labels dynamically by brand or generic name."""
    name = medicine_name.strip()

    if not name:
        raise ValueError("Enter a medicine name.")

    if len(name) > 150:
        raise ValueError("Medicine name must be 150 characters or fewer.")

    # Search fields in order, without maintaining a hardcoded alias list.
    escaped = name.replace("\\", "\\\\").replace('"', '\\"')

    # US drug-label data commonly uses acetaminophen
    # for the medicine known as paracetamol in India.
    search_names = [name]

    if name.casefold() == "paracetamol":
        search_names.append("acetaminophen")

    queries = []

    for search_name in search_names:
        escaped_name = (
            search_name.replace("\\", "\\\\")
            .replace('"', '\\"')
        )

        queries.extend([
            (
                f'openfda.brand_name:"{escaped_name}" OR '
                f'openfda.generic_name:"{escaped_name}" OR '
                f'openfda.substance_name:"{escaped_name}"'
            ),
            (
                f'openfda.brand_name:{escaped_name} OR '
                f'openfda.generic_name:{escaped_name} OR '
                f'openfda.substance_name:{escaped_name}'
            ),
        ])

    results = []
    seen = set()

    for query in queries:
        params = urlencode({"search": query, "limit": 10})
        request = Request(
            f"{FDA_LABEL_URL}?{params}",
            headers={"User-Agent": "MediLensAI/1.0"},
        )

        try:
            with urlopen(request, timeout=12) as response:
                payload = json.loads(response.read().decode("utf-8"))

        except HTTPError as exc:
            if exc.code == 404:
                # No results for this search format; try the fallback.
                continue
            raise RuntimeError(
                "The medicine information service is temporarily unavailable."
            ) from exc

        except (URLError, TimeoutError, json.JSONDecodeError) as exc:
            raise RuntimeError(
                "Could not connect to the medicine information service."
            ) from exc

        for item in payload.get("results", []):
            openfda = item.get("openfda", {})

            identity = (
                tuple(openfda.get("brand_name", [])),
                tuple(openfda.get("generic_name", [])),
                tuple(openfda.get("manufacturer_name", [])),
                tuple(item.get("active_ingredient", [])),
            )

            if identity in seen:
                continue

            seen.add(identity)

            results.append({
                "brand_names": openfda.get("brand_name", []),
                "generic_names": openfda.get("generic_name", []),
                "ingredients": openfda.get("substance_name", []),
                "manufacturer": openfda.get("manufacturer_name", []),
                "purpose": item.get("purpose", []),
                "indications_and_usage": item.get(
                    "indications_and_usage", []
                ),
                "dosage_and_administration": item.get(
                    "dosage_and_administration", []
                ),
                "warnings": item.get("warnings", []),
                "warnings_and_cautions": item.get(
                    "warnings_and_cautions", []
                ),
                "adverse_reactions": item.get("adverse_reactions", []),
                "active_ingredient": item.get("active_ingredient", []),
                "strength": item.get("strength", []),
                "route": item.get("route", []),
            })

        # Stop after the first query format that returns matches.
        if results:
            break

    return {
        "found": bool(results),
        "query": name,
        "results": results[:5],
        "source": FDA_LABEL_URL,
        "message": (
            "Drug label information retrieved."
            if results
            else (
                "No matching US drug label was found. "
                "Try the generic name or check the spelling."
            )
        ),
    }
