import React from 'react';
import { Link } from 'react-router-dom'; // Import Link

// Types expected from OrgDashboardPage
interface OrgMember {
    login: string;
    name?: string | null;
}
interface UserActivitySummary {
    commitCount: number;
    prAuthoredCount: number;
    issueAuthoredCount: number;
    prCommentCount: number;
}
interface TeamActivityDashboardProps {
  activityByUser: { [login: string]: UserActivitySummary };
  teamMembers: OrgMember[]; // Expect array of OrgMember objects
}

const TeamActivityDashboard: React.FC<TeamActivityDashboardProps> = ({ activityByUser, teamMembers }) => {

  // Combine member info with activity counts
  const memberStats = teamMembers.map(member => {
    const login = member.login.toLowerCase();
    // Ensure activityByUser[login] exists or provide defaults
    const activity = activityByUser[login] || { 
        commitCount: 0, 
        prAuthoredCount: 0, 
        issueAuthoredCount: 0, 
        prCommentCount: 0 
    };
    return {
      ...member,
      ...activity,
      displayName: member.name || member.login // Use login if name is null/empty
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
            <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
            {/* Username column can be optional if name includes login */}
            {/* <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Username</th> */}
            <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider text-right">Commits</th>
            <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider text-right">PRs Authored</th>
            {/* Issues Authored column - keep or remove as needed */}
            {/* <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider text-right">Issues Authored</th> */}
            <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider text-right">PR Comments</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {memberStats.map((member) => (
            <tr key={member.login} className="hover:bg-gray-50">
              <td className="px-4 py-3 whitespace-nowrap">
                <Link to={`/user/${member.login}`} className="text-blue-600 hover:underline font-medium">
                  {member.displayName}
                </Link>
              </td>
              {/* <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">{member.login}</td> */}
              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 text-right">{member.commitCount}</td>
              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 text-right">{member.prAuthoredCount}</td>
              {/* <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 text-right">{member.issueAuthoredCount}</td> */}
              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 text-right">{member.prCommentCount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default TeamActivityDashboard; 