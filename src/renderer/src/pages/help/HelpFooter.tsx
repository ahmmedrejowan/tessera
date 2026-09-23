import BugReportOutlined from '@mui/icons-material/BugReportOutlined';
import ForumOutlined from '@mui/icons-material/ForumOutlined';
import MailOutlineRounded from '@mui/icons-material/MailOutlineRounded';
import OpenInNewRounded from '@mui/icons-material/OpenInNewRounded';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { LINKS } from '@shared/about';
import { call } from '../../api';
import { useReportProblem } from '../../reports/ReportProblem';
import { md, SHAPE } from '../../theme';

const open = (url: string) => void call('app:openExternal', url);

/**
 * The same ending on every help page: the ways to reach a person, in the order they're usually
 * wanted, a report with the logs, the tracker where things are decided, an email, the source.
 */
export function HelpFooter() {
  const report = useReportProblem();
  return (
    <section style={{ marginTop: 40, padding: 24, borderRadius: SHAPE.lg, background: md('surfaceContainerLow') }}>
      <Typography variant="titleMedium" component="h2" sx={{ color: md('onSurface') }}>
        Didn’t find it?
      </Typography>
      <Typography variant="bodyMedium" component="div" sx={{ color: md('onSurfaceVariant'), mt: 0.5, maxWidth: 620 }}>
        Tessera is one person’s project, and what you send is read by a person. A problem report brings the logs with it; anything else is best in the tracker, where it stays visible.
      </Typography>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 20 }}>
        <Button variant="contained" startIcon={<BugReportOutlined />} onClick={() => report.show()}>
          Report a problem
        </Button>
        <Button variant="outlined" startIcon={<ForumOutlined />} onClick={() => open(LINKS.issues)}>
          Issue tracker
        </Button>
        <Button startIcon={<MailOutlineRounded />} onClick={() => open(`mailto:${LINKS.email}?subject=Tessera`)}>
          {LINKS.email}
        </Button>
        <Button startIcon={<OpenInNewRounded />} onClick={() => open(LINKS.site)}>
          Tessera’s page
        </Button>
        <Button startIcon={<OpenInNewRounded />} onClick={() => open(LINKS.repo)}>
          Source code
        </Button>
      </div>
    </section>
  );
}
