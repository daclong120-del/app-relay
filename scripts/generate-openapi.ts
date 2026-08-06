import { execSync } from 'child_process';
import * as path from 'path';

const dashboardDir = path.resolve(__dirname, '../dashboard');
execSync('npm run openapi:generate', { cwd: dashboardDir, stdio: 'inherit' });
