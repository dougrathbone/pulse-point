import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom'; // Import BrowserRouter
// import Placeholder from '@/components/Placeholder'; // Remove Placeholder import
import App from './App'; // Import the main App component
import './index.css'; // Import Tailwind CSS

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter> { /* Wrap App with BrowserRouter */ }
      <App />
    </BrowserRouter>
    {/* Remove test H1 */}
    {/* <h1 className="text-2xl text-red-500 p-4">Vite + React Test</h1> */}
    {/* We'll add App component here later */}
  </React.StrictMode>,
); 