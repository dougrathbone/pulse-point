import React, { useState, useEffect } from 'react';
import TeamActivityDashboard from '@/components/TeamActivityDashboard';
import { TARGET_ORG } from '@/../settings'; // Import TARGET_ORG
// Import service types using path alias
import { OrgActivityData, OrgMember, UserActivitySummary } from '@/server/services/githubService';

// Define types 
// type Commit = any; // Keep for now, though not directly used here
// interface OrgMember { ... }
// interface UserActivitySummary { ... }
// interface OrgDashboardResponse { ... }

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

// API Response structure 
interface OrgDashboardApiResponse {
    // Include fields from OrgActivityData directly
    members: OrgMember[];
    activityByUser: { [login: string]: UserActivitySummary };
    // Add optional status flags
    isStale?: boolean;
    error?: any; 
    timestamp?: number;
}

const OrgDashboardPage: React.FC = () => {
  const [activityData, setActivityData] = useState<OrgDashboardApiResponse | null>(null);
  // Separate state for errors detected during fetch
  const [fetchError, setFetchError] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // Expose fetchData for refresh button
  const fetchData = React.useCallback(async (forceRefresh = false) => { // Add forceRefresh flag
      setLoading(true);
      setFetchError(null);
      // Don't clear data immediately if just refreshing
      // setActivityData(null); 
      try {
          const sinceDate = new Date();
          sinceDate.setDate(sinceDate.getDate() - 30); 
          const sinceISO = sinceDate.toISOString();
          // Add query param to potentially bypass cache on backend if needed
          const url = `/api/org/dashboard?since=${sinceISO}${forceRefresh ? '&refresh=true' : ''}`;
          const res = await fetch(url); 
          const data: OrgDashboardApiResponse = await res.json();

          // Store the whole response, including stale/error flags if present
          setActivityData(data); 

          // Throw an error if the response status was bad AND data wasn't successfully returned (even if stale)
          if (!res.ok && !data?.members) { 
               throw new Error(`API Error (${res.status}): ${data?.error?.message || 'Failed to fetch dashboard data'}`);
          }

      } catch (err: any) {
          console.error("Fetch error:", err);
          setFetchError(err); // Set fetch error state
      } finally {
          setLoading(false);
      }
  }, []); // Add dependencies if needed, empty for now

  useEffect(() => {
    fetchData(); // Initial fetch
  }, [fetchData]); 

  // Derive specific error states from the activityData.error or fetchError
  const isStale = activityData?.isStale || false;
  const apiError = activityData?.error || fetchError;
  const ssoRequired = apiError?.ssoRequired || false;
  const ssoUrl = apiError?.ssoUrl || null;
  const rateLimitExceeded = apiError?.rateLimitExceeded || false;
  const rateLimitResetTimestamp = apiError?.resetTimestamp || null;

  const handleAuthenticate = () => {
      if (ssoUrl) {
          window.location.href = ssoUrl; 
      }
  };

  // Function to display reset time
  const getRateLimitResetTime = () => {
      if (!rateLimitResetTimestamp) return 'unknown time.';
      return new Date(rateLimitResetTimestamp).toLocaleTimeString();
  };

  // Helper to display stale reason
  const getStaleReason = () => {
      if (!apiError) return 'an unknown issue';
      if (apiError.rateLimitExceeded) return `GitHub API rate limit (resets around ${new Date(apiError.resetTimestamp).toLocaleTimeString()})`;
      if (apiError.ssoRequired) return 'GitHub SAML SSO re-authentication needed';
      return apiError.message || 'an unknown API error';
  }

  return (
    <div> { /* Remove outer container styling, App will handle layout */ }
      <h2 className="text-xl font-semibold mb-6 text-gray-700 text-center">
        GitHub Team Activity Summary - Org: {TARGET_ORG} (Last 30 Days)
      </h2>

      <div className="flex justify-center items-center mb-4 space-x-4">
         <button 
             onClick={() => fetchData(true)} // Call fetchData with forceRefresh=true
             disabled={loading} 
             className="bg-indigo-500 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold py-1 px-3 rounded text-sm"
         >
             {loading ? 'Refreshing...' : 'Refresh Data'}
         </button>
         {activityData?.timestamp && (
            <p className="text-xs text-gray-500">
                Data as of: {new Date(activityData.timestamp).toLocaleString()}
            </p>
         )}
      </div>

      {loading && <p className="text-center text-gray-500 py-8">Loading organization activity...</p>}
      
      {/* Stale Data Notification */} 
      {isStale && (
          <div className="p-3 mb-4 text-sm text-blue-700 bg-blue-100 rounded-lg dark:bg-blue-200 dark:text-blue-800" role="alert">
              <span className="font-medium">Stale Data:</span> Displaying cached data due to {getStaleReason()}. Data may be outdated.
          </div>
      )}

      {/* SAML Error/Button */} 
      {ssoRequired && (
          <div className="text-center p-4 mb-4 bg-yellow-100 border border-yellow-300 rounded">
              <p className="text-yellow-800 mb-3">{apiError.message}</p>
              <button 
                  onClick={handleAuthenticate}
                  className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline"
              >
                  Authenticate with GitHub SSO
              </button>
          </div>
      )}

      {/* Display Rate Limit Error */} 
      {rateLimitExceeded && (
           <div className="text-center p-4 mb-4 bg-orange-100 border border-orange-300 rounded">
                <p className="text-orange-800 mb-1">{apiError.message}</p>
                <p className="text-orange-700 text-sm">Please wait until the rate limit resets (around {getRateLimitResetTime()}) and try refreshing.</p>
            </div>
      )}

      {/* Other Fetch Errors */} 
      {apiError && !ssoRequired && !rateLimitExceeded && (
        <p className="text-center text-red-600 bg-red-100 p-4 rounded border border-red-300">{`Error: ${apiError.message || 'Failed to load data.'}`}</p>
      )}
      
      {/* Display dashboard (even if stale) */} 
      {activityData?.members && activityData?.activityByUser && (
        <TeamActivityDashboard 
            activityByUser={activityData.activityByUser} 
            teamMembers={activityData.members} 
        />
      )}
      {/* Handle case where loading is done, no errors, but no data (e.g., empty org) */}
      {!loading && !apiError && !activityData?.members && (
           <p className="text-center text-gray-500 py-8">No activity data found for the organization members in the selected period.</p>
      )}
    </div>
  );
};

export default OrgDashboardPage; 