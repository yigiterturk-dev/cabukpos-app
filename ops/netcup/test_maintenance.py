"""maintenance.py — alarm ve ikinci kopya yardımcılarının birim testleri."""
import importlib.util
import json
from pathlib import Path
import unittest
from unittest import mock

SPEC = importlib.util.spec_from_file_location("maintenance", Path(__file__).with_name("maintenance.py"))
m = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(m)


class Response:
    def close(self):
        pass


def capture(store):
    def fake_urlopen(request, timeout=None):
        store.append((request.full_url, json.loads(request.data), dict(request.header_items()), timeout))
        return Response()
    return fake_urlopen


class NotifyTest(unittest.TestCase):
    def test_webhook_payload(self):
        calls = []
        with mock.patch.object(m.urllib.request, "urlopen", capture(calls)):
            m.notify({"alert": {"webhook_url": "https://ops.test/hook"}},
                     "cabukpos-backup-failed", {"job": "backup", "error": "test"})
        self.assertEqual(len(calls), 1)
        url, body, headers, timeout = calls[0]
        self.assertEqual(url, "https://ops.test/hook")
        self.assertEqual(body["service"], "cabukpos-ops")
        self.assertEqual(body["event"], "cabukpos-backup-failed")
        self.assertEqual(body["detail"]["job"], "backup")
        self.assertEqual(timeout, 5)
        self.assertEqual(headers.get("Content-type"), "application/json")

    def test_resend_fallback(self):
        calls = []
        config = {"alert": {"email": "ops@example.test", "resend_api_key": "re_test", "mail_from": "cabukpos@example.test"}}
        with mock.patch.object(m.urllib.request, "urlopen", capture(calls)):
            m.notify(config, "cabukpos-restore-failed", {"job": "restore"})
        self.assertEqual(len(calls), 1)
        url, body, headers, _ = calls[0]
        self.assertEqual(url, "https://api.resend.com/emails")
        self.assertEqual(body["to"], ["ops@example.test"])
        self.assertEqual(body["from"], "cabukpos@example.test")
        self.assertIn("cabukpos-restore-failed", body["subject"])
        self.assertEqual(headers.get("Authorization"), "Bearer re_test")

    def test_no_config_is_noop(self):
        calls = []
        with mock.patch.object(m.urllib.request, "urlopen", capture(calls)):
            m.notify({}, "x", {})
        self.assertEqual(calls, [])

    def test_alert_failure_is_swallowed(self):
        def boom(*_args, **_kwargs):
            raise OSError("network down")
        with mock.patch.object(m.urllib.request, "urlopen", boom):
            m.notify({"alert": {"webhook_url": "https://ops.test/hook"}}, "x", {})


class OffsiteTest(unittest.TestCase):
    def test_placeholder_expansion(self):
        config = {"offsite_command": ["rclone", "copy", "{dir}", "remote:cabukpos"]}
        with mock.patch.object(m, "run", return_value=b"") as run:
            ok = m.offsite(config, Path("/var/backups/a.dump.enc"), Path("/var/backups"))
        self.assertTrue(ok)
        run.assert_called_once_with(["rclone", "copy", "/var/backups", "remote:cabukpos"])

    def test_path_placeholder(self):
        config = {"offsite_command": ["cp", "{path}", "/mnt/offsite/"]}
        with mock.patch.object(m, "run", return_value=b"") as run:
            m.offsite(config, Path("/var/backups/a.dump.enc"), Path("/var/backups"))
        run.assert_called_once_with(["cp", "/var/backups/a.dump.enc", "/mnt/offsite/"])

    def test_absent_is_false(self):
        with mock.patch.object(m, "run") as run:
            self.assertFalse(m.offsite({}, Path("/a"), Path("/b")))
        run.assert_not_called()

    def test_invalid_command_rejected(self):
        with self.assertRaisesRegex(RuntimeError, "offsite_command"):
            m.offsite({"offsite_command": "rclone copy"}, Path("/a"), Path("/b"))
        with self.assertRaisesRegex(RuntimeError, "offsite_command"):
            m.offsite({"offsite_command": []}, Path("/a"), Path("/b"))

    def test_copy_failure_propagates(self):
        config = {"offsite_command": ["false"]}
        with mock.patch.object(m, "run", side_effect=RuntimeError("copy failed")):
            with self.assertRaisesRegex(RuntimeError, "copy failed"):
                m.offsite(config, Path("/a"), Path("/b"))


if __name__ == "__main__":
    unittest.main()
