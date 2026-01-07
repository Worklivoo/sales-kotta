import React, { useState } from 'react';
import Sidebar from './components/Sidebar';
import RequisitionsPage from './pages/Requisitions';
import SuppliersPage from './pages/Suppliers';

function App() {
  const [activeTab, setActiveTab] = useState<'requisitions' | 'suppliers'>('requisitions');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar 
        activeTab={activeTab} 
        onTabChange={setActiveTab} 
        isCollapsed={isSidebarCollapsed}
        toggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
      />
      
      <main 
        className={`flex-1 p-6 lg:p-10 transition-all duration-300 ease-in-out ${
          isSidebarCollapsed ? 'ml-[100px]' : 'ml-[300px]'
        }`}
      >
        <div className="max-w-[1600px] mx-auto h-full">
          {activeTab === 'requisitions' ? (
            <RequisitionsPage />
          ) : (
            <SuppliersPage />
          )}
        </div>
      </main>
    </div>
  );
}

export default App;