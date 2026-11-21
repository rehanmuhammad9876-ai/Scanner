export async function POST(request: Request) {
  try {
    const body = await request.json();

    const SCRIPT_URL =
      "https://script.google.com/macros/s/AKfycbybGwVRMmOg0GJCm4NqRDFmJqI1u6aDvpyb9d7DAtrPDtgvvKl4HOaGIeQ655dE7W-8/exec";

    const response = await fetch(SCRIPT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });

    const result = await response.json();

    return Response.json(result, {
      status: response.ok ? 200 : 502,
    });
  } catch (error) {
  return Response.json(
    {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Gagal mengirim data ke Google Sheet",
    },
    { status: 500 }
  );
  }
