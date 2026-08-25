// SecurTrajet - Local Store with Parent Isolation
// Chaque parent ne voit que SES enfants

const STORAGE_KEY = 'securtrajet_db_v1';

const defaultDb = {
  users: [],
  children: [],
  positions: [],
  geofences: [],
  alerts: [],
  currentUserId: null
};

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return structuredClone(defaultDb);
}

function save(db) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
}

function generateId() {
  return 'id_' + Math.random().toString(36).slice(2, 11) + Date.now().toString(36);
}

// Seed demo data if empty
function ensureSeed(db) {
  if (db.users.length === 0) {
    const parentId = generateId();
    db.users.push({
      id: parentId,
      email: 'parent@demo.com',
      password: 'demo123', // plain for demo only
      firstName: 'Honoré',
      lastName: 'Fotso',
      role: 'parent',
      createdAt: new Date().toISOString()
    });

    const child1 = generateId();
    const child2 = generateId();
    const child3 = generateId();

    db.children.push(
      {
        id: child1,
        parentId,
        firstName: 'Sophie',
        lastName: 'Fotso',
        birthDate: '2015-03-12',
        photo: null,
        trackerId: 'TRK-SOPHIE-01',
        battery: 87,
        status: 'online',
        lastSeenAt: new Date().toISOString(),
        createdAt: new Date().toISOString()
      },
      {
        id: child2,
        parentId,
        firstName: 'Léa',
        lastName: 'Fotso',
        birthDate: '2018-07-22',
        photo: null,
        trackerId: 'TRK-LEA-02',
        battery: 62,
        status: 'online',
        lastSeenAt: new Date().toISOString(),
        createdAt: new Date().toISOString()
      },
      {
        id: child3,
        parentId,
        firstName: 'Léo',
        lastName: 'Fotso',
        birthDate: '2020-11-05',
        photo: null,
        trackerId: 'TRK-LEO-03',
        battery: 12,
        status: 'offline',
        lastSeenAt: new Date(Date.now() - 18 * 60 * 1000).toISOString(),
        createdAt: new Date().toISOString()
      }
    );

    // Positions initiales (Bafoussam area)
    const now = Date.now();
    db.positions.push(
      { id: generateId(), childId: child1, parentId, latitude: 5.4781, longitude: 10.4172, speed: 0, battery: 87, timestamp: new Date(now).toISOString() },
      { id: generateId(), childId: child2, parentId, latitude: 5.4750, longitude: 10.4150, speed: 3.2, battery: 62, timestamp: new Date(now).toISOString() },
      { id: generateId(), childId: child3, parentId, latitude: 5.4800, longitude: 10.4200, speed: 0, battery: 12, timestamp: new Date(now - 18 * 60 * 1000).toISOString() }
    );

    // Géofences
    db.geofences.push(
      {
        id: generateId(),
        parentId,
        childId: null,
        name: 'Maison',
        type: 'circle',
        lat: 5.4770,
        lng: 10.4160,
        radius: 150,
        alertOnEnter: true,
        alertOnExit: true
      },
      {
        id: generateId(),
        parentId,
        childId: null,
        name: 'École',
        type: 'circle',
        lat: 5.4820,
        lng: 10.4220,
        radius: 100,
        alertOnEnter: true,
        alertOnExit: true
      }
    );

    // Alertes
    db.alerts.push(
      {
        id: generateId(),
        parentId,
        childId: child3,
        type: 'low_battery',
        message: 'Batterie faible de Léo (12%)',
        read: false,
        createdAt: new Date(now - 10 * 60 * 1000).toISOString()
      },
      {
        id: generateId(),
        parentId,
        childId: child3,
        type: 'offline',
        message: 'Léo est hors ligne depuis 18 min',
        read: false,
        createdAt: new Date(now - 5 * 60 * 1000).toISOString()
      }
    );

    save(db);
  }
  return db;
}

export const store = {
  getDb() {
    let db = load();
    db = ensureSeed(db);
    return db;
  },

  saveDb(db) {
    save(db);
  },

  // Auth
  register({ email, password, firstName, lastName }) {
    const db = this.getDb();
    if (db.users.find(u => u.email === email)) {
      throw new Error('Cet email est déjà utilisé');
    }
    const user = {
      id: generateId(),
      email,
      password, // demo only
      firstName,
      lastName,
      role: 'parent',
      createdAt: new Date().toISOString()
    };
    db.users.push(user);
    db.currentUserId = user.id;
    this.saveDb(db);
    return user;
  },

  login(email, password) {
    const db = this.getDb();
    const user = db.users.find(u => u.email === email && u.password === password);
    if (!user) throw new Error('Email ou mot de passe incorrect');
    db.currentUserId = user.id;
    this.saveDb(db);
    return user;
  },

  logout() {
    const db = this.getDb();
    db.currentUserId = null;
    this.saveDb(db);
  },

  // Relie ce magasin local (démo) au compte Supabase réellement connecté
  setCurrentUser(userId, { email, firstName, lastName } = {}) {
    if (!userId) return;
    const db = this.getDb();
    let user = db.users.find(u => u.id === userId);
    if (!user) {
      user = { id: userId, email, firstName, lastName, role: 'parent', createdAt: new Date().toISOString() };
      db.users.push(user);
    } else {
      user.email = email ?? user.email;
      user.firstName = firstName ?? user.firstName;
      user.lastName = lastName ?? user.lastName;
    }
    db.currentUserId = userId;
    this.saveDb(db);
  },

  getCurrentUser() {
    const db = this.getDb();
    if (!db.currentUserId) return null;
    return db.users.find(u => u.id === db.currentUserId) || null;
  },

  // Children - STRICT isolation by parentId
  getMyChildren() {
    const user = this.getCurrentUser();
    if (!user) return [];
    const db = this.getDb();
    return db.children.filter(c => c.parentId === user.id);
  },

  getChild(childId) {
    const user = this.getCurrentUser();
    if (!user) return null;
    const db = this.getDb();
    const child = db.children.find(c => c.id === childId && c.parentId === user.id);
    return child || null;
  },

  addChild({ firstName, lastName, birthDate, trackerId }) {
    const user = this.getCurrentUser();
    if (!user) throw new Error('Non authentifié');
    const db = this.getDb();
    const child = {
      id: generateId(),
      parentId: user.id,
      firstName,
      lastName,
      birthDate,
      photo: null,
      trackerId: trackerId || `TRK-${Date.now()}`,
      battery: 100,
      status: 'online',
      lastSeenAt: new Date().toISOString(),
      createdAt: new Date().toISOString()
    };
    db.children.push(child);
    // Position initiale
    db.positions.push({
      id: generateId(),
      childId: child.id,
      parentId: user.id,
      latitude: 5.4781 + (Math.random() - 0.5) * 0.01,
      longitude: 10.4172 + (Math.random() - 0.5) * 0.01,
      speed: 0,
      battery: 100,
      timestamp: new Date().toISOString()
    });
    this.saveDb(db);
    return child;
  },

  // Positions
  getLatestPosition(childId) {
    const user = this.getCurrentUser();
    if (!user) return null;
    const db = this.getDb();
    const positions = db.positions
      .filter(p => p.childId === childId && p.parentId === user.id)
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    return positions[0] || null;
  },

  getHistory(childId, limit = 50) {
    const user = this.getCurrentUser();
    if (!user) return [];
    const db = this.getDb();
    return db.positions
      .filter(p => p.childId === childId && p.parentId === user.id)
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, limit);
  },

  // Simulate movement (for demo)
  simulateMovement() {
    const user = this.getCurrentUser();
    if (!user) return;
    const db = this.getDb();
    const myChildren = db.children.filter(c => c.parentId === user.id && c.status === 'online');
    
    myChildren.forEach(child => {
      const last = db.positions
        .filter(p => p.childId === child.id)
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];
      
      if (last) {
        const newPos = {
          id: generateId(),
          childId: child.id,
          parentId: user.id,
          latitude: last.latitude + (Math.random() - 0.5) * 0.0015,
          longitude: last.longitude + (Math.random() - 0.5) * 0.0015,
          speed: Math.random() * 15,
          battery: Math.max(5, child.battery - Math.random() * 0.5),
          timestamp: new Date().toISOString()
        };
        db.positions.push(newPos);
        child.battery = Math.round(newPos.battery);
        child.lastSeenAt = newPos.timestamp;
        if (child.battery < 15) child.status = 'low_battery';
      }
    });
    this.saveDb(db);
  },

  // Alerts
  getMyAlerts() {
    const user = this.getCurrentUser();
    if (!user) return [];
    const db = this.getDb();
    return db.alerts
      .filter(a => a.parentId === user.id)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  },

  markAlertRead(alertId) {
    const user = this.getCurrentUser();
    if (!user) return;
    const db = this.getDb();
    const alert = db.alerts.find(a => a.id === alertId && a.parentId === user.id);
    if (alert) {
      alert.read = true;
      this.saveDb(db);
    }
  },

  // Geofences
  getMyGeofences() {
    const user = this.getCurrentUser();
    if (!user) return [];
    const db = this.getDb();
    return db.geofences.filter(g => g.parentId === user.id);
  },

  // Reset demo
  resetDemo() {
    localStorage.removeItem(STORAGE_KEY);
  }
};

export default store;
