import React from 'react';

// Placeholder type
type Commit = any; 
// Define the enriched member type passed from App
interface OrgMember {
    login: string;
    name?: string | null;
}
interface TeamActivityDashboardProps {
  commitsByAuthor: { [authorLogin: string]: Commit[] };
  teamMembers: OrgMember[]; // Expect array of OrgMember objects
}

const TeamActivityDashboard: React.FC<TeamActivityDashboardProps> = ({ commitsByAuthor, teamMembers }) => {

  // Create a map for quick lookup of member names by login
  const memberMap = teamMembers.reduce((acc, member) => {
      acc[member.login.toLowerCase()] = member;
      return acc;
  }, {} as { [login: string]: OrgMember });

  // Ensure all fetched members are represented, even with 0 commits in period
  const displayData = teamMembers.reduce((acc, member) => {
      const login = member.login.toLowerCase();
      acc[login] = commitsByAuthor[login] || [];
      return acc;
  }, {} as { [authorLogin: string]: Commit[] });

  // Sort by login for consistent order
  const sortedLogins = Object.keys(displayData).sort();

  if (sortedLogins.length === 0) {
    return <p className="text-gray-500">No team members found in the organization or no activity.</p>;
  }

  return (
    <div className="space-y-6">
      {sortedLogins.map((authorLogin) => {
        const commits = displayData[authorLogin];
        const memberInfo = memberMap[authorLogin]; // Get member info (incl. name)
        const displayName = memberInfo?.name ? `${memberInfo.name} (${authorLogin})` : authorLogin;

        return (
          <div key={authorLogin} className="bg-white shadow-md rounded-lg p-4">
            <h3 className="text-lg font-semibold mb-3 text-gray-800 border-b pb-2">
              {/* Display name and username */} 
              {displayName} - Commits: {commits.length}
            </h3>
            {commits.length > 0 ? (
              <ul className="space-y-2">
                {commits.map((commit) => (
                  <li key={commit.sha} className="border-l-4 border-indigo-500 pl-3 text-sm">
                    <a href={commit.html_url} target="_blank" rel="noopener noreferrer" className="hover:underline text-indigo-600 font-medium">
                      {commit.sha.substring(0, 7)}
                    </a>
                    <p className="truncate text-gray-700" title={commit.commit.message}>
                      {commit.commit.message.split('\n')[0]}
                    </p>
                    <p className="text-gray-500 text-xs">
                      {new Date(commit.commit.author?.date || Date.now()).toLocaleString()}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-gray-500 text-sm italic">No commits found in the selected period.</p>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default TeamActivityDashboard; 