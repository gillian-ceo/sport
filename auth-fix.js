(function () {
  function installStatusStyles() {
    if (document.querySelector("#progressfit-auth-fix-styles")) return;

    const style = document.createElement("style");
    style.id = "progressfit-auth-fix-styles";
    style.textContent = `
      .status-pill {
        max-width: min(680px, 100%);
        line-height: 1.35;
        white-space: normal;
      }
    `;
    document.head.append(style);
  }

  function authRedirectUrl() {
    if (typeof getAuthRedirectUrl === "function") {
      return getAuthRedirectUrl();
    }

    return `${window.location.origin}${window.location.pathname}`;
  }

  function readableSupabaseError(error) {
    const rawMessage = error?.message || "erreur inconnue";
    const message = rawMessage.toLowerCase();
    const details = [
      error?.status ? `status ${error.status}` : null,
      error?.code ? `code ${error.code}` : null
    ].filter(Boolean).join(", ");
    const suffix = details ? ` (${details})` : "";

    if (message.includes("redirect") || message.includes("not allowed")) {
      return `URL de redirection refusee. Ajoute ${authRedirectUrl()} dans Supabase > Authentication > URL Configuration > Redirect URLs. Message original: ${rawMessage}${suffix}`;
    }

    if (message.includes("invalid api key") || message.includes("api key")) {
      return `cle anon invalide. Verifie config.js. Message original: ${rawMessage}${suffix}`;
    }

    if (message.includes("signup") || message.includes("signups")) {
      return `les inscriptions email semblent desactivees. Active Email provider/signups dans Supabase Auth. Message original: ${rawMessage}${suffix}`;
    }

    if (message.includes("rate") || message.includes("too many")) {
      return `trop de demandes envoyees. Attends un peu puis reessaie. Message original: ${rawMessage}${suffix}`;
    }

    if (message.includes("smtp") || message.includes("email")) {
      return `probleme d'envoi email cote Supabase. Verifie Auth > Email provider. Message original: ${rawMessage}${suffix}`;
    }

    return `${rawMessage}${suffix}`;
  }

  function showStatus(message, duration = 3200) {
    if (typeof notify === "function") {
      notify(message, duration);
      return;
    }

    if (typeof elements !== "undefined" && elements.connectionStatus) {
      elements.connectionStatus.textContent = message;
    }
  }

  async function patchedSendMagicLink() {
    const email = elements.authEmail.value.trim();
    if (!email) {
      showStatus("Ajoute ton email.");
      return;
    }

    if (!state.client) {
      showStatus("Supabase n'est pas configure. Verifie config.js ou reconnecte le projet.", 10000);
      if (typeof showSetup === "function") showSetup();
      return;
    }

    const { error } = await state.client.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: authRedirectUrl(),
        shouldCreateUser: true
      }
    });

    if (error) {
      console.error(error);
      showStatus(`Supabase: ${readableSupabaseError(error)}`, 14000);
      return;
    }

    showStatus("Lien envoye. Ouvre-le depuis ton email pour synchroniser l'app.", 8000);
  }

  installStatusStyles();

  if (typeof sendMagicLink === "function") {
    sendMagicLink = patchedSendMagicLink;
  }
})();
