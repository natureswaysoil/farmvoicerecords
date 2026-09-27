import { ImageResponse } from "next/og";

export const runtime = "edge";

export async function GET() {
  return new ImageResponse(
    <div style={{width:"100%",height:"100%",display:"flex",alignItems:"center",justifyContent:"center",background:"#1f6b3a",color:"white",fontSize:314,fontWeight:800}}>F</div>,
    { width: 512, height: 512 }
  );
}
