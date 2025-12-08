/**
 * ╔═══════════════════════════════════════════════════════════╗
 * ║         🗄️ DATABASE MONGODB POUR HANI-MD 🗄️              ║
 * ║                                                           ║
 * ║  Base de données externe pour stocker:                    ║
 * ║  - Session WhatsApp                                       ║
 * ║  - Utilisateurs, Groupes, Warns, Bans                     ║
 * ║  - Contacts, Messages, Stats                              ║
 * ║                                                           ║
 * ║  Utilise MongoDB Atlas (gratuit) pour la persistence      ║
 * ╚═══════════════════════════════════════════════════════════╝
 */

const mongoose = require("mongoose");

// ═══════════════════════════════════════════════════════════
// 📦 SCHÉMAS MONGODB
// ═══════════════════════════════════════════════════════════

// Session WhatsApp (la plus importante !)
const sessionSchema = new mongoose.Schema({
  sessionId: { type: String, required: true, unique: true, default: "principale" },
  data: { type: Object, required: true },  // Contient les credentials encodés
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Utilisateurs
const userSchema = new mongoose.Schema({
  jid: { type: String, required: true, unique: true },
  name: { type: String, default: "" },
  xp: { type: Number, default: 0 },
  level: { type: Number, default: 1 },
  messages: { type: Number, default: 0 },
  coins: { type: Number, default: 0 },
  lastSeen: { type: Date, default: Date.now },
  lastDaily: { type: Date, default: null },
  isBanned: { type: Boolean, default: false },
  isSudo: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

// Groupes
const groupSchema = new mongoose.Schema({
  jid: { type: String, required: true, unique: true },
  name: { type: String, default: "" },
  antilink: { type: Boolean, default: false },
  antispam: { type: Boolean, default: false },
  antibot: { type: Boolean, default: false },
  antitag: { type: Boolean, default: false },
  welcome: { type: Boolean, default: true },
  goodbye: { type: Boolean, default: true },
  mute: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

// Warns
const warnSchema = new mongoose.Schema({
  jid: { type: String, required: true },
  groupJid: { type: String, required: true },
  reason: { type: String, default: "Non spécifié" },
  warnedBy: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

// Contacts (base de contacts avec noms réels)
const contactSchema = new mongoose.Schema({
  jid: { type: String, required: true, unique: true },
  number: { type: String, required: true },
  name: { type: String, default: "" },
  firstSeen: { type: Date, default: Date.now },
  lastSeen: { type: Date, default: Date.now },
  lastActivity: { type: String, default: "" },
  messagesCount: { type: Number, default: 0 }
});

// Stats globales
const statsSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, default: "global" },
  commands: { type: Number, default: 0 },
  messages: { type: Number, default: 0 },
  startTime: { type: Date, default: Date.now },
  totalUsers: { type: Number, default: 0 },
  totalGroups: { type: Number, default: 0 }
});

// Settings
const settingSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  value: { type: mongoose.Schema.Types.Mixed }
});

// Messages stockés (pour anti-delete)
const storedMessageSchema = new mongoose.Schema({
  messageId: { type: String, required: true, unique: true },
  from: { type: String, required: true },
  sender: { type: String, required: true },
  senderName: { type: String, default: "" },
  content: { type: String, default: "" },
  type: { type: String, default: "text" },
  media: { type: Buffer, default: null },
  timestamp: { type: Date, default: Date.now }
}, { expires: 86400 }); // Expire après 24h

// ═══════════════════════════════════════════════════════════
// 📦 MODÈLES
// ═══════════════════════════════════════════════════════════

const Session = mongoose.model("Session", sessionSchema);
const User = mongoose.model("User", userSchema);
const Group = mongoose.model("Group", groupSchema);
const Warn = mongoose.model("Warn", warnSchema);
const Contact = mongoose.model("Contact", contactSchema);
const Stats = mongoose.model("Stats", statsSchema);
const Setting = mongoose.model("Setting", settingSchema);
const StoredMessage = mongoose.model("StoredMessage", storedMessageSchema);

// ═══════════════════════════════════════════════════════════
// 🔌 CLASSE DATABASE
// ═══════════════════════════════════════════════════════════

class MongoDatabase {
  constructor() {
    this.isConnected = false;
    this.mongoUrl = process.env.MONGODB_URI || process.env.MONGO_URL || "";
  }

  // Connexion à MongoDB
  async connect() {
    if (!this.mongoUrl) {
      console.log("⚠️ MONGODB_URI non défini - Mode fichier local");
      return false;
    }

    try {
      await mongoose.connect(this.mongoUrl, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
      });
      this.isConnected = true;
      console.log("✅ Connecté à MongoDB Atlas !");
      
      // Initialiser les stats si elles n'existent pas
      await Stats.findOneAndUpdate(
        { key: "global" },
        { $setOnInsert: { commands: 0, messages: 0, startTime: new Date() } },
        { upsert: true, new: true }
      );
      
      return true;
    } catch (e) {
      console.error("❌ Erreur connexion MongoDB:", e.message);
      return false;
    }
  }

  // ────────── SESSION ──────────
  
  async saveSession(sessionData) {
    if (!this.isConnected) return false;
    try {
      await Session.findOneAndUpdate(
        { sessionId: "principale" },
        { data: sessionData, updatedAt: new Date() },
        { upsert: true, new: true }
      );
      console.log("💾 Session sauvegardée dans MongoDB");
      return true;
    } catch (e) {
      console.error("❌ Erreur sauvegarde session:", e.message);
      return false;
    }
  }

  async getSession() {
    if (!this.isConnected) return null;
    try {
      const session = await Session.findOne({ sessionId: "principale" });
      return session?.data || null;
    } catch (e) {
      return null;
    }
  }

  async deleteSession() {
    if (!this.isConnected) return false;
    try {
      await Session.deleteOne({ sessionId: "principale" });
      return true;
    } catch (e) {
      return false;
    }
  }

  // ────────── UTILISATEURS ──────────

  async getUser(jid) {
    if (!this.isConnected) return null;
    try {
      let user = await User.findOne({ jid });
      if (!user) {
        user = await User.create({ jid });
      }
      return user;
    } catch (e) {
      return null;
    }
  }

  async updateUser(jid, data) {
    if (!this.isConnected) return false;
    try {
      await User.findOneAndUpdate({ jid }, data, { upsert: true });
      return true;
    } catch (e) {
      return false;
    }
  }

  async addXP(jid, amount = 5) {
    if (!this.isConnected) return { levelUp: false };
    try {
      const user = await this.getUser(jid);
      if (!user) return { levelUp: false };

      user.xp += amount;
      user.messages += 1;
      user.lastSeen = new Date();

      const xpNeeded = user.level * 100;
      let levelUp = false;

      if (user.xp >= xpNeeded) {
        user.level += 1;
        user.xp = 0;
        levelUp = true;
      }

      await user.save();
      return { levelUp, newLevel: user.level };
    } catch (e) {
      return { levelUp: false };
    }
  }

  async banUser(jid) {
    return await this.updateUser(jid, { isBanned: true });
  }

  async unbanUser(jid) {
    return await this.updateUser(jid, { isBanned: false });
  }

  async isBanned(jid) {
    const user = await this.getUser(jid);
    return user?.isBanned || false;
  }

  async addSudo(jid) {
    return await this.updateUser(jid, { isSudo: true });
  }

  async removeSudo(jid) {
    return await this.updateUser(jid, { isSudo: false });
  }

  async isSudo(jid) {
    const user = await this.getUser(jid);
    return user?.isSudo || false;
  }

  async getBannedUsers() {
    if (!this.isConnected) return [];
    try {
      const users = await User.find({ isBanned: true });
      return users.map(u => u.jid);
    } catch (e) {
      return [];
    }
  }

  async getSudoUsers() {
    if (!this.isConnected) return [];
    try {
      const users = await User.find({ isSudo: true });
      return users.map(u => u.jid);
    } catch (e) {
      return [];
    }
  }

  // ────────── GROUPES ──────────

  async getGroup(jid) {
    if (!this.isConnected) return null;
    try {
      let group = await Group.findOne({ jid });
      if (!group) {
        group = await Group.create({ jid });
      }
      return group;
    } catch (e) {
      return null;
    }
  }

  async updateGroup(jid, data) {
    if (!this.isConnected) return false;
    try {
      await Group.findOneAndUpdate({ jid }, data, { upsert: true });
      return true;
    } catch (e) {
      return false;
    }
  }

  // ────────── WARNS ──────────

  async addWarn(jid, groupJid, reason, warnedBy) {
    if (!this.isConnected) return 0;
    try {
      await Warn.create({ jid, groupJid, reason, warnedBy });
      const count = await Warn.countDocuments({ jid, groupJid });
      return count;
    } catch (e) {
      return 0;
    }
  }

  async removeWarn(jid, groupJid) {
    if (!this.isConnected) return 0;
    try {
      await Warn.findOneAndDelete({ jid, groupJid });
      const count = await Warn.countDocuments({ jid, groupJid });
      return count;
    } catch (e) {
      return 0;
    }
  }

  async getWarns(jid, groupJid) {
    if (!this.isConnected) return [];
    try {
      return await Warn.find({ jid, groupJid });
    } catch (e) {
      return [];
    }
  }

  async getWarnCount(jid, groupJid) {
    if (!this.isConnected) return 0;
    try {
      return await Warn.countDocuments({ jid, groupJid });
    } catch (e) {
      return 0;
    }
  }

  // ────────── CONTACTS ──────────

  async updateContact(jid, name, additionalData = {}) {
    if (!this.isConnected) return false;
    try {
      const number = jid.split("@")[0];
      await Contact.findOneAndUpdate(
        { jid },
        { 
          number,
          name: name || "",
          lastSeen: new Date(),
          $inc: { messagesCount: 1 },
          ...additionalData
        },
        { upsert: true }
      );
      return true;
    } catch (e) {
      return false;
    }
  }

  async getContact(jidOrNumber) {
    if (!this.isConnected) return null;
    try {
      const number = jidOrNumber.split("@")[0].replace(/[^0-9]/g, "");
      return await Contact.findOne({
        $or: [{ jid: jidOrNumber }, { number }]
      });
    } catch (e) {
      return null;
    }
  }

  async getAllContacts() {
    if (!this.isConnected) return [];
    try {
      return await Contact.find().sort({ lastSeen: -1 });
    } catch (e) {
      return [];
    }
  }

  async searchContacts(query) {
    if (!this.isConnected) return [];
    try {
      return await Contact.find({
        $or: [
          { name: { $regex: query, $options: "i" } },
          { number: { $regex: query } }
        ]
      }).limit(20);
    } catch (e) {
      return [];
    }
  }

  // ────────── STATS ──────────

  async incrementStats(field) {
    if (!this.isConnected) return;
    try {
      await Stats.findOneAndUpdate(
        { key: "global" },
        { $inc: { [field]: 1 } }
      );
    } catch (e) {}
  }

  async getStats() {
    if (!this.isConnected) return null;
    try {
      return await Stats.findOne({ key: "global" });
    } catch (e) {
      return null;
    }
  }

  // ────────── MESSAGES STOCKÉS ──────────

  async storeMessage(messageId, data) {
    if (!this.isConnected) return false;
    try {
      await StoredMessage.findOneAndUpdate(
        { messageId },
        data,
        { upsert: true }
      );
      return true;
    } catch (e) {
      return false;
    }
  }

  async getMessage(messageId) {
    if (!this.isConnected) return null;
    try {
      return await StoredMessage.findOne({ messageId });
    } catch (e) {
      return null;
    }
  }

  // ────────── SETTINGS ──────────

  async setSetting(key, value) {
    if (!this.isConnected) return false;
    try {
      await Setting.findOneAndUpdate(
        { key },
        { value },
        { upsert: true }
      );
      return true;
    } catch (e) {
      return false;
    }
  }

  async getSetting(key, defaultValue = null) {
    if (!this.isConnected) return defaultValue;
    try {
      const setting = await Setting.findOne({ key });
      return setting?.value ?? defaultValue;
    } catch (e) {
      return defaultValue;
    }
  }
}

module.exports = { MongoDatabase, Session, User, Group, Warn, Contact, Stats, Setting, StoredMessage };
