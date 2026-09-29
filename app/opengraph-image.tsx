import { ImageResponse } from "next/og";
export const alt = "FarmVoice Records — Speak, review and save";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          background: "#123d2d",
          color: "#fff",
          padding: 80,
        }}
      >
        <div style={{ fontSize: 30, color: "#b7dbaa" }}>FARMVOICE RECORDS</div>
        <div style={{ fontSize: 76, marginTop: 30 }}>Speak. Review. Save.</div>
        <div style={{ fontSize: 34, marginTop: 30 }}>
          Farm records and workforce, organized.
        </div>
      </div>
    ),
    size,
  );
}
