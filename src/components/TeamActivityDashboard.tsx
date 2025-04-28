import React from 'react';
import { Link } from 'react-router-dom'; // Import Link

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

  // Calculate commit counts and combine with member info
  const memberStats = teamMembers.map(member => {
    const login = member.login.toLowerCase();
    const commitCount = commitsByAuthor[login]?.length || 0;
    return {
      ...member,
      commitCount,
      displayName: member.name ? `${member.name} (${member.login})` : member.login
    };
  });

  // Sort members by commit count (descending)
  memberStats.sort((a, b) => b.commitCount - a.commitCount);

  if (memberStats.length === 0) {
    return <p className="text-gray-500">No team members found in the organization.</p>;
  }

  return (
    <div className="space-y-4">
      {memberStats.map((member) => {
        const commits = commitsByAuthor[member.login.toLowerCase()] || [];
        return (
          <div key={member.login} className="bg-white shadow-md rounded-lg p-4 transition duration-150 ease-in-out hover:shadow-lg">
            <Link 
                to={`/user/${member.login}`}
                className="block hover:bg-gray-50 -m-4 p-4 rounded-lg" // Make the whole block linkable (optional style)
            >
                <h3 className="text-lg font-semibold text-gray-800">
                  {member.displayName} - Commits: {member.commitCount}
                  {/* Placeholder for PRs/Comments later */}
                  {/* - PRs: ? - Comments: ? */} 
                </h3>
            </Link>

            {/* Optionally keep showing top few commits here, or remove for cleaner summary */} 
            {/* {commits.length > 0 ? ( ... ) : ( ... )} */} 
            <p className="text-sm text-gray-500 mt-1">
                Click for detailed view.
            </p>
          </div>
        );
      })}
    </div>
  );
};

export default TeamActivityDashboard; 