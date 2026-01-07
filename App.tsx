import React, { useState } from 'react';
import Sidebar from './components/Sidebar';
import RequisitionsPage from './pages/Requisitions';
import SuppliersPage from './pages/Suppliers';
import SettingsPage from './pages/Settings';
import SubscriptionPage from './pages/Subscription';

function App() {
  const [activeTab, setActiveTab] = useState<'requisitions' | 'suppliers' | 'settings' | 'subscription'>('requisitions');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar 
        activeTab={activeTab} 
        onTabChange={setActiveTab} 
        isCollapsed={isSidebarCollapsed}
        toggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
      />
      
      <main 
        className={`flex-1 h-full overflow-hidden py-6 pr-6 lg:py-10 lg:pr-10 transition-all duration-300 ease-in-out w-full ${
          isSidebarCollapsed ? 'pl-[120px]' : 'pl-[320px]'
        }`}
      >
        <div className="max-w-[1600px] mx-auto h-full w-full">
          {activeTab === 'requisitions' && <RequisitionsPage />}
          {activeTab === 'suppliers' && <SuppliersPage />}
          {activeTab === 'settings' && <SettingsPage />}
          {activeTab === 'subscription' && <SubscriptionPage />}
        </div>
      </main>
    </div>
  );
}

export default App;