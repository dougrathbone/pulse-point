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
      displayName: member.name || '' // Use name or empty string
    };
  });

  // Sort members by commit count (descending)
  memberStats.sort((a, b) => b.commitCount - a.commitCount);

  if (memberStats.length === 0) {
    return <p className="text-gray-500">No team members found in the organization.</p>;
  }

  return (
    <div className="overflow-x-auto bg-white shadow-md rounded-lg">
      <table className="min-w-full table-auto text-left">
        <thead className="border-b bg-gray-100">
          <tr>
            <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
            <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Username</th>
            <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider text-right">Commits (30d)</th>
            {/* Add headers for PRs/Issues later */}
            {/* <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider text-right">PRs</th> */}
            {/* <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider text-right">Issues</th> */}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {memberStats.map((member) => (
            <tr key={member.login} className="hover:bg-gray-50">
              <td className="px-6 py-4 whitespace-nowrap">
                <Link to={`/user/${member.login}`} className="text-blue-600 hover:underline font-medium">
                  {member.displayName || member.login} { /* Show login if no display name */ }
                </Link>
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                {member.login}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                {member.commitCount}
              </td>
              {/* Add cells for PRs/Issues later */}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default TeamActivityDashboard; 