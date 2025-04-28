import React from 'react';
import { Routes, Route, Link } from 'react-router-dom'; // Import routing components
import OrgDashboardPage from './pages/OrgDashboardPage';
import UserDetailPage from './pages/UserDetailPage';
// Settings import is removed, OrgDashboardPage handles it

const App: React.FC = () => {

  return (
    <div className="container mx-auto p-4 bg-gray-50 min-h-screen">
      <Link to="/">
        <h1 className="text-3xl font-bold mb-6 text-center text-indigo-700 hover:text-indigo-900">
            PulsePoint
        </h1>
      </Link>
      
      <Routes>
        <Route path="/" element={<OrgDashboardPage />} />
        <Route path="/user/:username" element={<UserDetailPage />} />
        {/* Add other routes here later */}
      </Routes>

    </div>
  );
};

export default App; 