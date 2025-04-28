import React, { useState, useEffect } from 'react';
import TeamActivityDashboard from '@/components/TeamActivityDashboard';
import { TARGET_ORG } from '@/../settings'; // Import TARGET_ORG

// Define types 
type Commit = any; // Keep for now, though not directly used here
interface OrgMember {
    login: string;
    name?: string | null;
}
// Structure for dashboard data per user
interface UserActivitySummary {
    commitCount: number;
    prAuthoredCount: number;
    issueAuthoredCount: number;
    prCommentCount: number;
}
// Updated response structure now includes isStale and optional error
interface OrgDashboardResponse {
    members: OrgMember[];
    activityByUser: { [login: string]: UserActivitySummary };
    isStale?: boolean;
    error?: any; // Store error details if stale
}

interface SamlErrorResponse {
    ssoRequired: true;
    ssoUrl: string;
    message: string;
}

interface RateLimitErrorResponse {
    rateLimitExceeded: true;
    resetTimestamp: number | null;
    message: string;
}

const OrgDashboardPage: React.FC = () => {
  const [activityByUser, setActivityByUser] = useState<{ [login: string]: UserActivitySummary }>({});
  const [orgMembers, setOrgMembers] = useState<OrgMember[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [ssoUrl, setSsoUrl] = useState<string | null>(null); 
  const [rateLimitInfo, setRateLimitInfo] = useState<{ resetTimestamp: number | null } | null>(null);
  const [isStale, setIsStale] = useState<boolean>(false);
  const [staleError, setStaleError] = useState<any>(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      setSsoUrl(null);
      setRateLimitInfo(null); // Reset rate limit state
      setIsStale(false); // Reset stale state
      setStaleError(null);
      try {
        const sinceDate = new Date();
        sinceDate.setDate(sinceDate.getDate() - 30); // Fetch last 30 days
        const sinceISO = sinceDate.toISOString();

        // Use new endpoint
        const res = await fetch(`/api/org/dashboard?since=${sinceISO}`); 
        
        if (res.status === 403) { 
            const errorData: SamlErrorResponse = await res.json();
            if (errorData.ssoRequired && errorData.ssoUrl) {
                console.warn("SAML SSO Required:", errorData.message);
                setError(errorData.message);
                setSsoUrl(errorData.ssoUrl); 
                return; 
            }
        }
        // Check for Rate Limit error (status 429)
        if (res.status === 429) {
            const errorData: RateLimitErrorResponse = await res.json();
            if (errorData.rateLimitExceeded) {
                console.warn("Rate Limit Exceeded:", errorData.message);
                setError(errorData.message); // Display message
                setRateLimitInfo({ resetTimestamp: errorData.resetTimestamp }); // Store reset time
                return; // Stop processing
            }
        }
        if (!res.ok && res.status !== 200) { // Check if status is not OK *and* not the 200 we use for stale data
            const errorData = await res.json().catch(() => ({}));
            throw new Error(`Error fetching org dashboard data: ${res.statusText} (${res.status}) - ${errorData?.message || 'Unknown API error'}`);
        }
        // Process potentially stale or fresh data
        const data: OrgDashboardResponse = await res.json();
        setActivityByUser(data.activityByUser || {}); // Handle case where data might be missing
        setOrgMembers(data.members || []);
        setIsStale(data.isStale || false); // Set stale flag
        if (data.isStale && data.error) {
            setStaleError(data.error); // Store the error that caused staleness
        }
      } catch (err: any) {
        console.error("Fetch error:", err);
        // Avoid setting generic error if SSO or rate limit error is already set
        if (!ssoUrl && !rateLimitInfo) {
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

  // Function to display reset time
  const getRateLimitResetTime = () => {
      if (!rateLimitInfo?.resetTimestamp) return 'unknown time.';
      return new Date(rateLimitInfo.resetTimestamp).toLocaleTimeString();
  };

  // Helper to display stale reason
  const getStaleReason = () => {
      if (!staleError) return 'an unknown issue';
      if (staleError.rateLimitExceeded) return `GitHub API rate limit (resets around ${new Date(staleError.resetTimestamp).toLocaleTimeString()})`;
      if (staleError.ssoRequired) return 'GitHub SAML SSO re-authentication needed';
      return staleError.message || 'an unknown API error';
  }

  return (
    <div> { /* Remove outer container styling, App will handle layout */ }
      <h2 className="text-xl font-semibold mb-6 text-gray-700 text-center">
        GitHub Team Activity Summary - Org: {TARGET_ORG} (Last 30 Days)
      </h2>

      {loading && <p className="text-center text-gray-500 py-8">Loading organization activity...</p>}
      
      {/* Stale Data Notification */} 
      {isStale && (
          <div className="p-3 mb-4 text-sm text-blue-700 bg-blue-100 rounded-lg dark:bg-blue-200 dark:text-blue-800" role="alert">
              <span className="font-medium">Stale Data:</span> Displaying cached data from the last successful fetch due to {getStaleReason()}. Data may be outdated.
          </div>
      )}

      {/* SAML Error/Button */} 
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

      {/* Display Rate Limit Error */} 
      {rateLimitInfo && error && !isStale && (
           <div className="text-center p-4 mb-4 bg-orange-100 border border-orange-300 rounded">
                <p className="text-orange-800 mb-1">{error}</p>
                <p className="text-orange-700 text-sm">Please wait until the rate limit resets (around {getRateLimitResetTime()}) and try refreshing.</p>
            </div>
      )}

      {/* Other Fetch Errors */} 
      {error && !ssoUrl && !rateLimitInfo && !isStale && (
        <p className="text-center text-red-600 bg-red-100 p-4 rounded border border-red-300">{`Error: ${error}`}</p>
      )}
      
      {/* Display dashboard (even if stale) */} 
      {(!loading && !ssoUrl && !rateLimitInfo) && (Object.keys(activityByUser).length > 0 || isStale) && (
        <TeamActivityDashboard activityByUser={activityByUser} teamMembers={orgMembers} />
      )}
      {/* Handle case where loading is done, no errors, but no data (e.g., empty org) */}
      {!loading && !error && !ssoUrl && !rateLimitInfo && Object.keys(activityByUser).length === 0 && !isStale && (
           <p className="text-center text-gray-500 py-8">No activity data found for the organization members in the selected period.</p>
      )}
    </div>
  );
};

export default OrgDashboardPage; 