import React, { useState, useEffect } from 'react';
import TeamActivityDashboard from '@/components/TeamActivityDashboard';
import { TARGET_ORG } from '@/../settings'; // Import TARGET_ORG

// Define types (consider moving to shared types file later)
type Commit = any; 
type CommitsByAuthor = { [authorLogin: string]: Commit[] };
interface OrgMember {
    login: string;
    name?: string | null;
}
interface OrgCommitResponse {
    commitsByAuthor: CommitsByAuthor;
    members: OrgMember[];
}
interface SamlErrorResponse {
    ssoRequired: true;
    ssoUrl: string;
    message: string;
}

const OrgDashboardPage: React.FC = () => {
  const [orgCommits, setOrgCommits] = useState<CommitsByAuthor>({});
  const [orgMembers, setOrgMembers] = useState<OrgMember[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [ssoUrl, setSsoUrl] = useState<string | null>(null); 

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      setSsoUrl(null); 
      try {
        const sinceDate = new Date();
        sinceDate.setDate(sinceDate.getDate() - 30); // Fetch last 30 days
        const sinceISO = sinceDate.toISOString();

        const res = await fetch(`/api/org/commits?since=${sinceISO}`); 
        
        if (res.status === 403) { 
            const errorData: SamlErrorResponse = await res.json();
            if (errorData.ssoRequired && errorData.ssoUrl) {
                console.warn("SAML SSO Required:", errorData.message);
                setError(errorData.message);
                setSsoUrl(errorData.ssoUrl); 
                return; 
            }
        }
        if (!res.ok) {
            const errorData = await res.json().catch(() => ({ message: 'Failed to parse error response' })); 
            throw new Error(`Error fetching org commits: ${res.statusText} (${res.status}) - ${errorData?.message || 'Unknown API error'}`);
        }
        const data: OrgCommitResponse = await res.json();
        setOrgCommits(data.commitsByAuthor);
        setOrgMembers(data.members); 
      } catch (err: any) {
        console.error("Fetch error:", err);
        if (!ssoUrl) {
           setError(err.message || 'Failed to fetch org data');
        }
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []); 

  const handleAuthenticate = () => {
      if (ssoUrl) {
          window.location.href = ssoUrl; 
      }
  };

  return (
    <div> { /* Remove outer container styling, App will handle layout */ }
      <h2 className="text-xl font-semibold mb-6 text-gray-700 text-center">
        GitHub Commit Activity for Org: {TARGET_ORG} - Last 30 Days
      </h2>

      {loading && <p className="text-center text-gray-500 py-8">Loading organization activity...</p>}
      
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

      {error && !ssoUrl && (
        <p className="text-center text-red-600 bg-red-100 p-4 rounded border border-red-300">{`Error: ${error}`}</p>
      )}
      
      {!loading && !error && !ssoUrl && (
        <TeamActivityDashboard commitsByAuthor={orgCommits} teamMembers={orgMembers} />
      )}
    </div>
  );
};

export default OrgDashboardPage; 