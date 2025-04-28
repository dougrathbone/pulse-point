import React from 'react';
import ReactDOM from 'react-dom/client';
import Placeholder from '@/components/Placeholder'; // Uncomment
import './index.css'; // Import Tailwind CSS

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {/* Restore Placeholder */}
    <Placeholder />
    {/* Remove test H1 */}
    {/* <h1 className="text-2xl text-red-500 p-4">Vite + React Test</h1> */}
    {/* We'll add App component here later */}
  </React.StrictMode>,
); 