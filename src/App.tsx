import React, { useState, useEffect } from 'react';
import TeamActivityDashboard from '@/components/TeamActivityDashboard';
// We only need TARGET_ORG here now to display it
// import { TARGET_ORG } from '@/config/settings'; // Use path alias
import { TARGET_ORG } from '@/../settings'; // Use path alias relative to src

// Define placeholder types for now
type Commit = any;
type CommitsByAuthor = { [authorLogin: string]: Commit[] };

// Define the structure expected from the new API response
interface OrgMember {
    login: string;
    name?: string | null;
}

interface OrgCommitResponse {
    commitsByAuthor: CommitsByAuthor;
    members: OrgMember[];
}

// Type for the SAML SSO error response from our backend
interface SamlErrorResponse {
    ssoRequired: true;
    ssoUrl: string;
    message: string;
}

const App: React.FC = () => {
  const [orgCommits, setOrgCommits] = useState<CommitsByAuthor>({});
  const [orgMembers, setOrgMembers] = useState<OrgMember[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [ssoUrl, setSsoUrl] = useState<string | null>(null); // State for SAML URL

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      setSsoUrl(null); // Reset SSO state on fetch
      try {
        const sinceDate = new Date();
        sinceDate.setDate(sinceDate.getDate() - 30); // Fetch last 30 days
        const sinceISO = sinceDate.toISOString();

        // Fetch commits for the configured organization
        const res = await fetch(`/api/org/commits?since=${sinceISO}`); 
        
        // Check for specific SAML error status (e.g., 403 or 401)
        // We used 403 in the backend SamlSsoError status
        if (res.status === 403) { 
            const errorData: SamlErrorResponse = await res.json();
            if (errorData.ssoRequired && errorData.ssoUrl) {
                console.warn("SAML SSO Required:", errorData.message);
                setError(errorData.message); // Display message to user
                setSsoUrl(errorData.ssoUrl); // Store the URL
                return; // Stop further processing
            }
        }

        if (!res.ok) {
            const errorData = await res.json().catch(() => ({ message: 'Failed to parse error response' })); 
            throw new Error(`Error fetching org commits: ${res.statusText} (${res.status}) - ${errorData?.message || 'Unknown API error'}`);
        }
        const data: OrgCommitResponse = await res.json();
        setOrgCommits(data.commitsByAuthor);
        setOrgMembers(data.members); // Store the OrgMember objects

      } catch (err: any) {
        console.error("Fetch error:", err);
        // Avoid setting generic error if SSO error is already set
        if (!ssoUrl) {
           setError(err.message || 'Failed to fetch org data');
        }
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []); // Empty dependency array means run once on mount

  const handleAuthenticate = () => {
      if (ssoUrl) {
          window.location.href = ssoUrl; // Redirect to GitHub SSO page
      }
  };

  return (
    <div className="container mx-auto p-4 bg-gray-50 min-h-screen">
      <h1 className="text-3xl font-bold mb-2 text-center text-indigo-700">PulsePoint</h1>
      <h2 className="text-lg font-semibold mb-6 text-gray-600 text-center">
        GitHub Commit Activity for Org: {TARGET_ORG} - Last 30 Days
      </h2>

      {loading && <p className="text-center text-gray-500 py-8">Loading organization activity...</p>}
      
      {/* Display SAML Auth button if needed */}      
      {ssoUrl && error && (
          <div className="text-center p-4 mb-4 bg-yellow-100 border border-yellow-300 rounded">
              <p className="text-yellow-800 mb-3">{error}</p>
              <button 
                  onClick={handleAuthenticate}
                  className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline"
              >
                  Authenticate with GitHub SSO
              </button>
          </div>
      )}

      {/* Display other errors (only if not an SSO error) */}      
      {error && !ssoUrl && (
        <p className="text-center text-red-600 bg-red-100 p-4 rounded border border-red-300">{`Error: ${error}`}</p>
      )}

      {/* Display dashboard only if not loading, no error, and no SSO required */}      
      {!loading && !error && !ssoUrl && (
        <TeamActivityDashboard commitsByAuthor={orgCommits} teamMembers={orgMembers} />
      )}
    </div>
  );
};

export default App; 