"""Exercise strict public deployment gate with controlled curl responses."""
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

SCRIPT = Path(__file__).with_name('verify-public.sh')

class PublicVerificationTests(unittest.TestCase):
    def check_case(self, results, expected_exit, expected_attempts):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'results').write_text('\n'.join(results) + '\n')
            (root / 'count').write_text('0')
            (root / 'curl').write_text('''#!/bin/sh
count=$(cat "$CHECK_ROOT/count")
count=$((count + 1))
printf '%s' "$count" > "$CHECK_ROOT/count"
result=$(sed -n "${count}p" "$CHECK_ROOT/results")
case "$result" in
  NETWORK_ERROR) printf 000; exit 7;;
  *) printf '%s' "$result";;
esac
''')
            (root / 'sleep').write_text('#!/bin/sh\nexit 0\n')
            for name in ('curl', 'sleep'):
                (root / name).chmod(0o700)
            env = dict(os.environ, PATH=f'{root}:{os.environ["PATH"]}', CHECK_ROOT=str(root))
            process = subprocess.run(['bash', str(SCRIPT)], env=env, capture_output=True, text=True)
            self.assertEqual(process.returncode, expected_exit, process.stdout + process.stderr)
            self.assertEqual(int((root / 'count').read_text()), expected_attempts)
            if expected_exit:
                self.assertIn('::error::', process.stdout)

    def test_immediate_success(self): self.check_case(['200'], 0, 1)
    def test_recovers_after_proxy_refresh(self): self.check_case(['502', '200'], 0, 2)
    def test_failed_http_stays_failed(self): self.check_case(['503', '503', '503'], 1, 3)
    def test_network_failure_stays_failed(self): self.check_case(['NETWORK_ERROR'] * 3, 1, 3)

if __name__ == '__main__': unittest.main()
