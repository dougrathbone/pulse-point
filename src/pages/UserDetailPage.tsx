import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';

// Placeholder types
type CommitItem = { sha: string; commit: { message: string }; html_url: string };
type IssueItem = { id: number; number: number; title: string; html_url: string };
type PullRequestItem = { id: number; number: number; title: string; html_url: string };
type PullRequestCommentItem = { id: number; html_url: string; body: string };

// Updated summary stats structure
interface UserSummaryStats {
    commitCount: number;
    prAuthoredCount: number;
    issueAuthoredCount: number;
    prCommentCount: number;
    avgTurnaroundHours: number | null;
    avgCommentsBeforeShipping: number; // Placeholder
    totalOrgCommitCount: number;
    totalOrgPRCount: number; // Placeholder
    totalOrgIssueCount: number; // Placeholder
}

// Updated response structure from backend
interface UserDetailsResponse {
    username: string;
    summary: UserSummaryStats;
    commits: CommitItem[];
    pullRequestsAuthored: PullRequestItem[]; 
    issuesAuthored: IssueItem[]; 
    pullRequestCommentsMade: PullRequestCommentItem[]; // New field
    aiSummary: string;
    isStale?: boolean; // Add stale flag
    error?: any; // Add error context if stale
}

interface RateLimitErrorResponse {
    rateLimitExceeded: true;
    resetTimestamp: number | null;
    message: string;
}

// Helper function to calculate percentage
const calculatePercentage = (part: number, total: number): string => {
    if (total === 0) return "N/A";
    return ((part / total) * 100).toFixed(1) + '%';
};

// Helper function to format hours
const formatHours = (hours: number | null): string => {
    if (hours === null) return "N/A";
    if (hours < 48) return hours.toFixed(1) + ' hrs';
    return (hours / 24).toFixed(1) + ' days';
};

const UserDetailPage: React.FC = () => {
    const { username } = useParams<{ username: string }>();
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const [userDetails, setUserDetails] = useState<UserDetailsResponse | null>(null);
    const [ssoUrl, setSsoUrl] = useState<string | null>(null); // Handle potential SAML on user page
    const [rateLimitInfo, setRateLimitInfo] = useState<{ resetTimestamp: number | null } | null>(null);
    const [isStale, setIsStale] = useState<boolean>(false);
    const [staleError, setStaleError] = useState<any>(null);

    useEffect(() => {
        if (!username) return;

        const fetchData = async () => {
            setLoading(true);
            setError(null);
            setSsoUrl(null);
            setUserDetails(null);
            setRateLimitInfo(null);
            setIsStale(false);
            setStaleError(null);
            try {
                const sinceDate = new Date();
                sinceDate.setDate(sinceDate.getDate() - 30); // Match 30-day range
                const sinceISO = sinceDate.toISOString();

                const res = await fetch(`/api/user/${username}/details?since=${sinceISO}`);
                
                if (res.status === 403) { // Check for SAML SSO error
                    const errorData = await res.json(); // Assuming backend sends SamlErrorResponse structure
                    if (errorData.ssoRequired && errorData.ssoUrl) {
                        setError(errorData.message);
                        setSsoUrl(errorData.ssoUrl);
                        return; 
                    }
                }
                if (res.status === 429) {
                    const errorData: RateLimitErrorResponse = await res.json();
                    if (errorData.rateLimitExceeded) {
                        console.warn("Rate Limit Exceeded:", errorData.message);
                        setError(errorData.message);
                        setRateLimitInfo({ resetTimestamp: errorData.resetTimestamp });
                        return; 
                    }
                }
                if (!res.ok) {
                    const errorData = await res.json().catch(() => ({}));
                    throw new Error(`Error fetching user details: ${res.statusText} (${res.status}) - ${errorData?.message || 'Unknown API error'}`);
                }
                const data: UserDetailsResponse = await res.json();
                setUserDetails(data);
                setIsStale(data.isStale || false);
                if (data.isStale && data.error) {
                    setStaleError(data.error);
                    setError(null); 
                    setRateLimitInfo(null);
                    setSsoUrl(null);
                }

            } catch (err: any) {
                console.error("Fetch error:", err);
                 if (!ssoUrl && !rateLimitInfo) {
                    setError(err.message || 'Failed to fetch user details');
                 }
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [username]); // Re-fetch if username changes

    const handleAuthenticate = () => {
        if (ssoUrl) {
            window.location.href = ssoUrl;
        }
    };
    
    // No need to filter PRs/Issues here anymore, backend does it
    // const pullRequests = userDetails?.issuesAndPRs?.filter(item => item.pull_request) || [];
    // const issues = userDetails?.issuesAndPRs?.filter(item => !item.pull_request) || [];

    // Function to display reset time
    const getRateLimitResetTime = () => {
        if (!rateLimitInfo?.resetTimestamp) return 'unknown time.';
        return new Date(rateLimitInfo.resetTimestamp).toLocaleTimeString();
    };

    const getStaleReason = () => {
      if (!staleError) return 'an unknown issue';
      if (staleError.rateLimitExceeded) return `GitHub API rate limit (resets around ${new Date(staleError.resetTimestamp).toLocaleTimeString()})`;
      if (staleError.ssoRequired) return 'GitHub SAML SSO re-authentication needed';
      return staleError.message || 'an unknown API error';
    }

    return (
        <div className="p-4">
            <Link to="/" className="text-blue-600 hover:underline mb-4 inline-block">&larr; Back to Dashboard</Link>
            <h2 className="text-2xl font-bold mb-4">User Details: {username}</h2>
            
            {loading && <p className="text-center text-gray-500 py-8">Loading user details...</p>}
            
            {/* Stale Data Notification */} 
            {isStale && (
                <div className="p-3 mb-4 text-sm text-blue-700 bg-blue-100 rounded-lg" role="alert">
                    <span className="font-medium">Stale Data:</span> Displaying cached data due to {getStaleReason()}. Data may be outdated.
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
            
            {/* Display other errors (only if not SAML or Rate Limit) */} 
            {error && !ssoUrl && !rateLimitInfo && !isStale && <p className="text-center text-red-500 bg-red-100 p-4 rounded border border-red-300">Error loading details: {error}</p>}

            {userDetails && !loading && !error && (
                 <div className="space-y-6">
                    {/* ---- Quick Summary ---- */}
                    <div className="bg-white p-6 rounded shadow-md grid grid-cols-2 md:grid-cols-5 gap-4 text-center">
                        {/* Commits */}
                        <div>
                            <span className="text-2xl font-bold text-blue-600">{userDetails.summary.commitCount}</span>
                            <p className="text-sm text-gray-500">Commits</p>
                            <p className="text-xs text-gray-400">
                                ({calculatePercentage(userDetails.summary.commitCount, userDetails.summary.totalOrgCommitCount)} of Org)
                            </p>
                            {/* TODO: Add percentile calculation */} 
                            {/* <p className="text-xs text-gray-400">(XXth Percentile)</p> */} 
                        </div>
                        {/* PRs Authored */}
                        <div>
                            <span className="text-2xl font-bold text-green-600">{userDetails.summary.prAuthoredCount}</span>
                            <p className="text-sm text-gray-500">PRs Authored</p>
                             {/* TODO: Add org comparison */}
                            {/* <p className="text-xs text-gray-400">(X% of Org)</p> */} 
                            {/* <p className="text-xs text-gray-400">(XXth Percentile)</p> */} 
                        </div>
                         {/* Issues Authored */}
                        <div>
                            <span className="text-2xl font-bold text-orange-600">{userDetails.summary.issueAuthoredCount}</span>
                            <p className="text-sm text-gray-500">Issues Authored</p>
                             {/* TODO: Add org comparison */}
                            {/* <p className="text-xs text-gray-400">(X% of Org)</p> */} 
                            {/* <p className="text-xs text-gray-400">(XXth Percentile)</p> */} 
                        </div>
                         {/* PR Comments Made */}
                        <div>
                            <span className="text-2xl font-bold text-purple-600">{userDetails.summary.prCommentCount}</span>
                            <p className="text-sm text-gray-500">PR Comments Made</p>
                            {/* TODO: Add org comparison */}
                             {/* <p className="text-xs text-gray-400">(X% of Org)</p> */} 
                            {/* <p className="text-xs text-gray-400">(Avg: Y / Shipped PR)</p> */} 
                        </div>
                        {/* Avg PR Turnaround */}
                        <div>
                             <span className="text-2xl font-bold text-teal-600">{formatHours(userDetails.summary.avgTurnaroundHours)}</span>
                             <p className="text-sm text-gray-500">Avg PR Turnaround</p>
                             <p className="text-xs text-gray-400">(Created to Close)</p>
                        </div>
                    </div>
                    
                    {/* ---- AI Summary ---- */} 
                    <div className="bg-white p-6 rounded shadow-md">
                        <h3 className="text-lg font-semibold mb-2">AI Performance Summary (Last 30 Days)</h3>
                        <p className="text-gray-700 whitespace-pre-wrap">
                            {userDetails.aiSummary}
                        </p>
                        <p className="text-xs text-gray-400 mt-2 italic">(Claude API key required in .env for real summary)</p>
                    </div>
                    
                    {/* ---- Detailed Lists ---- */} 
                    {/* Commits */} 
                    <div className="bg-white p-4 rounded shadow-md">
                        <h3 className="text-lg font-semibold mb-3">Commits ({userDetails.commits.length})</h3>
                        {userDetails.commits.length > 0 ? (
                            <ul className="space-y-2 max-h-60 overflow-y-auto">
                                {userDetails.commits.map((commit) => (
                                    <li key={commit.sha} className="text-sm border-l-4 border-blue-500 pl-2">
                                        <a href={commit.html_url} target="_blank" rel="noopener noreferrer" className="hover:underline text-blue-600 font-mono text-xs">{commit.sha.substring(0,7)}</a>
                                        <p className="truncate text-gray-800" title={commit.commit.message}>{commit.commit.message.split('\n')[0]}</p>
                                    </li>
                                ))}
                            </ul>
                        ) : <p className="text-gray-500 italic">No commits found.</p>}
                    </div>
                    
                    {/* Pull Requests Authored */} 
                    <div className="bg-white p-4 rounded shadow-md">
                        <h3 className="text-lg font-semibold mb-3">Pull Requests Authored ({userDetails.summary.prAuthoredCount})</h3>
                         {userDetails.pullRequestsAuthored.length > 0 ? (
                            <ul className="space-y-2 max-h-60 overflow-y-auto">
                                {userDetails.pullRequestsAuthored.map((pr) => (
                                    <li key={pr.id} className="text-sm border-l-4 border-green-500 pl-2">
                                        <a href={pr.html_url} target="_blank" rel="noopener noreferrer" className="hover:underline text-blue-600">#{pr.number} {pr.title}</a>
                                    </li>
                                ))}
                            </ul>
                         ) : <p className="text-gray-500 italic">No pull requests found.</p>}
                    </div>

                    {/* Issues Authored */} 
                    <div className="bg-white p-4 rounded shadow-md">
                        <h3 className="text-lg font-semibold mb-3">Issues Authored ({userDetails.summary.issueAuthoredCount})</h3>
                         {userDetails.issuesAuthored.length > 0 ? (
                            <ul className="space-y-2 max-h-60 overflow-y-auto">
                                {userDetails.issuesAuthored.map((issue) => (
                                    <li key={issue.id} className="text-sm border-l-4 border-orange-500 pl-2">
                                        <a href={issue.html_url} target="_blank" rel="noopener noreferrer" className="hover:underline text-blue-600">#{issue.number} {issue.title}</a>
                                    </li>
                                ))}
                            </ul>
                         ) : <p className="text-gray-500 italic">No issues found.</p>}
                    </div>
                    
                    {/* PR Comments Made */} 
                    <div className="bg-white p-4 rounded shadow-md">
                        <h3 className="text-lg font-semibold mb-3">PR Comments Made ({userDetails.summary.prCommentCount})</h3>
                         {userDetails.pullRequestCommentsMade.length > 0 ? (
                            <ul className="space-y-2 max-h-60 overflow-y-auto">
                                {userDetails.pullRequestCommentsMade.map((comment) => (
                                    <li key={comment.id} className="text-sm border-l-4 border-purple-500 pl-2">
                                        <a href={comment.html_url} target="_blank" rel="noopener noreferrer" className="hover:underline text-blue-600 text-xs font-mono">Comment Link</a>
                                        <p className="truncate text-gray-800" title={comment.body}>{comment.body?.substring(0, 150)}{comment.body?.length > 150 ? '...' : ''}</p> 
                                    </li>
                                ))}
                            </ul>
                         ) : <p className="text-gray-500 italic">No PR comments found.</p>}
                    </div>

                 </div>
            )}
             {/* Handle case where loading is done, no errors, but no data */}
            {!loading && !error && !ssoUrl && !rateLimitInfo && !userDetails && (
                 <p className="text-center text-gray-500 py-8">No details found for this user in the selected period.</p>
             )}
        </div>
    );
};

export default UserDetailPage; 