import { useState } from "react";
import { AuthPage } from "./components/AuthPage";
import { Dashboard } from "./components/Dashboard";
import { Sidebar } from "./components/Sidebar";
import { Topbar } from "./components/Topbar";
import { demoUsers } from "./data/mockData";
import type { Language } from "./i18n";
import { translations } from "./i18n";
import type { User } from "./types";

export default function App() {
  const [user, setUser] = useState<User | null>(demoUsers[4]);
  const [language, setLanguage] = useState<Language>("en");
  const t = translations[language];

  if (!user) {
    return <AuthPage language={language} onLanguageChange={setLanguage} onLogin={setUser} t={t} />;
  }

  return (
    <div className="app-shell">
      <Sidebar user={user} t={t} />
      <main className="workspace">
        <Topbar language={language} onLanguageChange={setLanguage} onLogout={() => setUser(null)} t={t} user={user} />
        <Dashboard t={t} user={user} />
      </main>
    </div>
  );
}
