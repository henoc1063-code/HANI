/**
 * ╔═══════════════════════════════════════════════════════════╗
 * ║         🔐 GÉNÉRATEUR DE SESSION HANI-MD 🔐               ║
 * ║                                                           ║
 * ║  Ce script génère une SESSION_ID que tu peux utiliser     ║
 * ║  pour déployer le bot sur Render, Railway, Heroku, etc.   ║
 * ║                                                           ║
 * ║  Usage: node session-generator.js                         ║
 * ╚═══════════════════════════════════════════════════════════╝
 */

const fs = require("fs");
const path = require("path");
const pino = require("pino");
const qrcode = require("qrcode-terminal");
const readline = require("readline");
const {
  default: makeWASocket,
  makeCacheableSignalKeyStore,
  Browsers,
  delay,
  useMultiFileAuthState,
  DisconnectReason,
} = require("@whiskeysockets/baileys");

const SESSION_FOLDER = "./DataBase/session/principale";
const SESSION_OUTPUT = "./session_id.txt";

console.log(`
╔═══════════════════════════════════════════════════════════╗
║         🔐 GÉNÉRATEUR DE SESSION HANI-MD 🔐               ║
╠═══════════════════════════════════════════════════════════╣
║                                                           ║
║  1. Scanne le QR code avec ton WhatsApp                   ║
║  2. Attends la confirmation de connexion                  ║
║  3. La SESSION_ID sera générée automatiquement            ║
║  4. Copie-la dans les variables d'environnement           ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
`);

async function generateSession() {
  // Nettoyer l'ancienne session
  if (fs.existsSync(SESSION_FOLDER)) {
    fs.rmSync(SESSION_FOLDER, { recursive: true, force: true });
    console.log("🗑️  Ancienne session supprimée");
  }

  // Créer le dossier
  fs.mkdirSync(SESSION_FOLDER, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(SESSION_FOLDER);

  const sock = makeWASocket({
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" })),
    },
    logger: pino({ level: "silent" }),
    browser: Browsers.ubuntu("Chrome"),
    markOnlineOnConnect: true,
  });

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log("\n📱 SCANNE CE QR CODE AVEC WHATSAPP:\n");
      qrcode.generate(qr, { small: true });
      console.log("\n⏳ En attente du scan...\n");
    }

    if (connection === "open") {
      console.log("\n✅ CONNEXION RÉUSSIE !\n");
      
      // Attendre que les credentials soient sauvegardés
      await delay(3000);
      await saveCreds();
      
      // Lire les fichiers de session et les encoder en base64
      const sessionData = await encodeSession();
      
      if (sessionData) {
        // Sauvegarder dans un fichier
        fs.writeFileSync(SESSION_OUTPUT, sessionData);
        
        console.log(`
╔═══════════════════════════════════════════════════════════╗
║              🎉 SESSION GÉNÉRÉE AVEC SUCCÈS !             ║
╠═══════════════════════════════════════════════════════════╣
║  📱 Numéro: ${(sock.user?.id?.split(":")[0] || "").padEnd(44)}║
║  👤 Nom: ${(sock.user?.name || "").padEnd(47)}║
╠═══════════════════════════════════════════════════════════╣
║                                                           ║
║  📋 Ta SESSION_ID a été sauvegardée dans:                 ║
║     → session_id.txt                                      ║
║                                                           ║
║  🚀 Pour déployer sur Render:                             ║
║     1. Ajoute une variable d'environnement                ║
║     2. Nom: SESSION_ID                                    ║
║     3. Valeur: (contenu de session_id.txt)                ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
`);
        
        // Afficher la SESSION_ID (les premiers 100 caractères)
        console.log("\n🔑 SESSION_ID (début):");
        console.log(sessionData.substring(0, 100) + "...\n");
        console.log(`📏 Longueur totale: ${sessionData.length} caractères\n`);
        
        // Copier dans le presse-papier si possible
        try {
          const { exec } = require("child_process");
          exec(`echo ${sessionData} | clip`, (err) => {
            if (!err) {
              console.log("📋 SESSION_ID copiée dans le presse-papier !\n");
            }
          });
        } catch (e) {}
      }
      
      console.log("👋 Fermeture du générateur...");
      await delay(2000);
      process.exit(0);
    }

    if (connection === "close") {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      
      if (statusCode === DisconnectReason.loggedOut) {
        console.log("❌ Déconnecté. Relance le script.");
        process.exit(1);
      } else if (statusCode !== 200) {
        console.log("🔄 Reconnexion...");
        await delay(3000);
        generateSession();
      }
    }
  });

  sock.ev.on("creds.update", saveCreds);
}

async function encodeSession() {
  try {
    const files = fs.readdirSync(SESSION_FOLDER);
    const sessionBundle = {};
    
    for (const file of files) {
      const filePath = path.join(SESSION_FOLDER, file);
      const stat = fs.statSync(filePath);
      
      if (stat.isFile()) {
        const content = fs.readFileSync(filePath);
        sessionBundle[file] = content.toString("base64");
      }
    }
    
    // Encoder tout le bundle en base64
    const jsonString = JSON.stringify(sessionBundle);
    const base64Session = Buffer.from(jsonString).toString("base64");
    
    return "HANI-MD~" + base64Session;
  } catch (e) {
    console.error("❌ Erreur encodage session:", e.message);
    return null;
  }
}

// Fonction pour décoder (utilisée au démarrage du bot)
function decodeSession(sessionId) {
  try {
    if (!sessionId || !sessionId.startsWith("HANI-MD~")) {
      return null;
    }
    
    const base64Data = sessionId.replace("HANI-MD~", "");
    const jsonString = Buffer.from(base64Data, "base64").toString("utf-8");
    const sessionBundle = JSON.parse(jsonString);
    
    return sessionBundle;
  } catch (e) {
    console.error("❌ Erreur décodage session:", e.message);
    return null;
  }
}

// Lancer le générateur
generateSession();
