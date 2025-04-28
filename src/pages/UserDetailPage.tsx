import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';

// Placeholder types
type CommitItem = { sha: string; commit: { message: string }; html_url: string };
type IssueItem = { id: number; number: number; title: string; html_url: string };
type PullRequestItem = { id: number; number: number; title: string; html_url: string };

// Structure for the summary data from the API
interface UserSummaryStats {
    commitCount: number;
    prCount: number;
    issueCount: number;
    totalOrgCommitCount: number;
}

// Updated response structure
interface UserDetailsResponse {
    username: string;
    summary: UserSummaryStats;
    commits: CommitItem[];
    pullRequests: PullRequestItem[]; // Expect separate PRs now
    issues: IssueItem[]; // Expect separate Issues now
    aiSummary: string;
}

const UserDetailPage: React.FC = () => {
    const { username } = useParams<{ username: string }>();
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const [userDetails, setUserDetails] = useState<UserDetailsResponse | null>(null);
    const [ssoUrl, setSsoUrl] = useState<string | null>(null); // Handle potential SAML on user page

    useEffect(() => {
        if (!username) return;

        const fetchData = async () => {
            setLoading(true);
            setError(null);
            setSsoUrl(null);
            setUserDetails(null);
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
                if (!res.ok) {
                    const errorData = await res.json().catch(() => ({}));
                    throw new Error(`Error fetching user details: ${res.statusText} (${res.status}) - ${errorData?.message || 'Unknown API error'}`);
                }
                const data: UserDetailsResponse = await res.json();
                setUserDetails(data);

            } catch (err: any) {
                console.error("Fetch error:", err);
                 if (!ssoUrl) {
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

    return (
        <div className="p-4">
            <Link to="/" className="text-blue-600 hover:underline mb-4 inline-block">&larr; Back to Dashboard</Link>
            <h2 className="text-2xl font-bold mb-4">User Details: {username}</h2>
            
            {loading && <p className="text-center text-gray-500 py-8">Loading user details...</p>}
            
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
            
            {error && !ssoUrl && <p className="text-center text-red-500 bg-red-100 p-4 rounded border border-red-300">Error loading details: {error}</p>}

            {userDetails && !loading && !error && (
                 <div className="space-y-6">
                    {/* ---- Quick Summary ---- */} 
                    <div className="bg-white p-6 rounded shadow-md grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
                        <div>
                            <span className="text-2xl font-bold text-blue-600">{userDetails.summary.commitCount}</span>
                            <p className="text-sm text-gray-500">Commits</p>
                            <p className="text-xs text-gray-400">(Org Total: {userDetails.summary.totalOrgCommitCount})</p>
                        </div>
                        <div>
                            <span className="text-2xl font-bold text-green-600">{userDetails.summary.prCount}</span>
                            <p className="text-sm text-gray-500">Pull Requests Opened</p>
                        </div>
                        <div>
                            <span className="text-2xl font-bold text-orange-600">{userDetails.summary.issueCount}</span>
                            <p className="text-sm text-gray-500">Issues Opened</p>
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
                    
                    {/* Pull Requests */} 
                    <div className="bg-white p-4 rounded shadow-md">
                        <h3 className="text-lg font-semibold mb-3">Pull Requests Opened ({userDetails.summary.prCount})</h3>
                         {userDetails.pullRequests.length > 0 ? (
                            <ul className="space-y-2 max-h-60 overflow-y-auto">
                                {userDetails.pullRequests.map((pr) => (
                                    <li key={pr.id} className="text-sm border-l-4 border-green-500 pl-2">
                                        <a href={pr.html_url} target="_blank" rel="noopener noreferrer" className="hover:underline text-blue-600">#{pr.number} {pr.title}</a>
                                    </li>
                                ))}
                            </ul>
                         ) : <p className="text-gray-500 italic">No pull requests found.</p>}
                    </div>

                    {/* Issues */} 
                    <div className="bg-white p-4 rounded shadow-md">
                        <h3 className="text-lg font-semibold mb-3">Issues Opened ({userDetails.summary.issueCount})</h3>
                         {userDetails.issues.length > 0 ? (
                            <ul className="space-y-2 max-h-60 overflow-y-auto">
                                {userDetails.issues.map((issue) => (
                                    <li key={issue.id} className="text-sm border-l-4 border-orange-500 pl-2">
                                        <a href={issue.html_url} target="_blank" rel="noopener noreferrer" className="hover:underline text-blue-600">#{issue.number} {issue.title}</a>
                                    </li>
                                ))}
                            </ul>
                         ) : <p className="text-gray-500 italic">No issues found.</p>}
                    </div>
                 </div>
            )}
        </div>
    );
};

export default UserDetailPage; 