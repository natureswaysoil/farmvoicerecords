"use client";
import { useEffect, useState } from "react";
const spanish: Record<string, string> = {
  "Sign in": "Iniciar sesión",
  "Create account": "Crear cuenta",
  "Email and password": "Correo y contraseña",
  "Set your FarmVoice password": "Cree su contraseña de FarmVoice",
  "Email address": "Correo electrónico",
  Password: "Contraseña",
  "Confirm password": "Confirmar contraseña",
  "Create or reset password": "Crear o restablecer contraseña",
  "Creating account...": "Creando cuenta…",
  "Signing in...": "Iniciando sesión…",
  "Use a password with at least 8 characters.":
    "Use una contraseña de al menos 8 caracteres.",
  "The passwords do not match.": "Las contraseñas no coinciden.",
  "Sign in with your FarmVoice email and password. You do not need an email link each time.":
    "Inicie sesión con su correo y contraseña de FarmVoice. No necesita un enlace de correo cada vez.",
  "New farm owners confirm the email address once. FarmVoice then creates the farm account automatically.":
    "Los nuevos propietarios confirman su correo una vez. FarmVoice crea la finca automáticamente. Los trabajadores deben usar Crear cuenta de trabajador desde Unirse a una finca.",
  "Account created, but FarmVoice could not finish setting up your farm account. Sign in and try again.":
    "La cuenta se creó, pero no se pudo configurar la finca. Inicie sesión y vuelva a intentarlo.",
  "If this email can be used for a FarmVoice account, check your inbox for the confirmation email. If you already have an account, use Create or reset password.":
    "Si este correo puede usarse para una cuenta, revise el mensaje de confirmación. Si ya tiene cuenta, use Crear o restablecer contraseña.",
  "FarmVoice authentication is not configured on this deployment yet.":
    "No se pudo conectar al servicio de acceso. Verifique la conexión y vuelva a intentarlo.",
  "Email or password is incorrect. If you previously used email sign-in links, choose Create or reset password below.":
    "El correo o la contraseña no son correctos. Si antes usaba enlaces de correo, seleccione Crear o restablecer contraseña.",
  "Signed in, but FarmVoice could not verify your account security requirements. Please try again.":
    "Se inició sesión, pero no se pudo verificar la seguridad de la cuenta. Vuelva a intentarlo.",
  "Signed in, but FarmVoice could not verify your two-factor authentication status. Please try again.":
    "No se pudo verificar la autenticación de dos factores. Vuelva a intentarlo.",
  "Signed in, but FarmVoice could not finish setting up your farm account. Please try again.":
    "Se inició sesión, pero no se pudo configurar la finca. Vuelva a intentarlo.",
  "Your email was confirmed, but FarmVoice could not finish setting up the farm account. Sign in again to retry.":
    "Su correo fue confirmado, pero no se pudo configurar la finca. Inicie sesión de nuevo.",
  "That confirmation link is invalid or expired. Request a new confirmation or password setup link.":
    "El enlace no es válido o ya venció. Solicite uno nuevo.",
  "Please wait a few minutes before trying again.":
    "Espere unos minutos antes de volver a intentarlo.",
  "Use a stronger password and try again.":
    "Use una contraseña más segura y vuelva a intentarlo.",
  "We could not create the account. Check your email format and connection, then retry or contact support.":
    "No se pudo crear la cuenta. Verifique el correo y la conexión, luego reintente o contacte al soporte.",
  "Already have an account?": "¿Ya tiene una cuenta?",
  "Previously used email links?": "¿Antes usaba enlaces de correo?",
};
export function useAuthLanguage() {
  const [es, setEs] = useState(false);
  useEffect(() => {
    setEs(localStorage.getItem("farmvoice-language") === "es");
  }, []);
  return {
    es,
    t: (s: string) => (es ? (spanish[s] ?? s) : s),
    toggle: () =>
      setEs((v) => {
        localStorage.setItem("farmvoice-language", v ? "en" : "es");
        return !v;
      }),
  };
}
