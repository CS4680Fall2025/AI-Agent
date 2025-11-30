import subprocess
import argparse
import os
import sys

class GitHelper:
    def __init__(self, repo_path=None):
        self.cwd = repo_path if repo_path else os.getcwd()
        if not os.path.exists(self.cwd):
            print(f"Warning: Directory '{self.cwd}' does not exist.")

    def run_command(self, command, strip=True):
        try:
            result = subprocess.run(
                command,
                cwd=self.cwd,
                check=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                shell=True
            )
            return result.stdout.strip() if strip else result.stdout
        except subprocess.CalledProcessError as e:
            print(f"Error executing command: {command}")
            print(e.stderr)
            return None

    def get_current_repo(self):
        """Get the repo im currently in"""
        # git rev-parse --show-toplevel gives the absolute path to the root of the repo
        repo_root = self.run_command("git rev-parse --show-toplevel")
        if repo_root:
            repo_name = os.path.basename(repo_root)
            print(f"Current Repository: {repo_name} ({repo_root})")
            return repo_name
        else:
            print("Not currently in a git repository.")
            return None

    def list_changes(self):
        """List my changes and the # of changes"""
        status_output = self.run_command("git status -s")
        if status_output is None:
            return

        if not status_output:
            print("No changes found.")
            return

        lines = status_output.split('\n')
        count = len(lines)
        
        print(f"Number of changes: {count}")
        print("Changes:")
        for line in lines:
            print(f"  {line}")

    def push_changes(self, message=None):
        """Push changes. If message is provided, commit first."""
        if message:
            self.commit_changes(message)

        print("Pushing to remote...")
        if self.run_command("git push") is not None:
            print("Successfully pushed changes.")

    def commit_changes(self, message="Auto-commit from GitHelper"):
        """Commit changes without pushing"""
        print("Staging all changes...")
        if self.run_command("git add .") is None: return

        print(f"Committing with message: '{message}'...")
        if self.run_command(f'git commit -m "{message}"') is None: return
        print("Successfully committed changes.")

    def pull_changes(self):
        """Pull changes"""
        print("Pulling latest changes...")
        if self.run_command("git pull") is not None:
            print("Successfully pulled changes.")

    def undo_last_commit(self):
        """Undo my last commit but keep changes"""
        print("Undoing last commit (keeping changes staged)...")
        # --soft keeps changes in staging area
        if self.run_command("git reset --soft HEAD~1") is not None:
            print("Successfully undid last commit.")

    def deploy(self, deploy_command=None):
        """Deploy my repo"""
        if not deploy_command:
            print("No deploy command specified. Please provide a command to run.")
            return

        print(f"Deploying with command: {deploy_command}...")
        if self.run_command(deploy_command) is not None:
            print("Deployment successful.")

    def change_directory(self, new_path):
        """Change current working directory"""
        if os.path.exists(new_path):
            self.cwd = new_path
            print(f"Changed directory to: {self.cwd}")
        else:
            print(f"Error: Directory '{new_path}' does not exist.")

    def get_log(self, limit=10):
        """Get recent git log"""
        print(f"Getting last {limit} commits...")
        log_output = self.run_command(f"git log --oneline -n {limit}")
        if log_output:
            print(log_output)
            return log_output
        return None

class DSLExecutor:
    def __init__(self, helper):
        self.helper = helper

    def execute_script(self, file_path):
        if not os.path.exists(file_path):
            print(f"Error: File '{file_path}' not found.")
            return

        print(f"Executing DSL script: {file_path}")
        with open(file_path, 'r') as f:
            lines = f.readlines()

        for i, line in enumerate(lines):
            line = line.strip()
            if not line or line.startswith('#'):
                continue
            
            print(f"\n[Line {i+1}] Executing: {line}")
            self._execute_line(line)

    def _execute_line(self, line):
        parts = line.split(' ', 1)
        command = parts[0].lower()
        arg = parts[1].strip().strip('"').strip("'") if len(parts) > 1 else None

        if command == 'repo':
            self.helper.get_current_repo()
        elif command == 'status':
            self.helper.list_changes()
        elif command == 'push':
            self.helper.push_changes(arg)
        elif command == 'commit':
            if arg:
                self.helper.commit_changes(arg)
            else:
                print("Error: 'commit' requires a message.")
        elif command == 'pull':
            self.helper.pull_changes()
        elif command == 'undo':
            self.helper.undo_last_commit()
        elif command == 'deploy':
            if arg:
                self.helper.deploy(arg)
            else:
                print("Error: 'deploy' requires a command.")
        elif command == 'cd':
            if arg:
                self.helper.change_directory(arg)
            else:
                print("Error: 'cd' requires a path.")
        elif command == 'log':
            limit = int(arg) if arg and arg.isdigit() else 10
            self.helper.get_log(limit)
        else:
            print(f"Error: Unknown command '{command}'")

def main():
    parser = argparse.ArgumentParser(description="GitHelper: Automate your git workflow")
    
    # Global arguments
    parser.add_argument("--dir", help="Target directory for the git repository", default=None)

    subparsers = parser.add_subparsers(dest="command", help="Available commands")

    # Subcommands
    subparsers.add_parser("repo", help="Get current repository info")
    subparsers.add_parser("status", help="List changes and count")
    
    push_parser = subparsers.add_parser("push", help="Push changes")
    push_parser.add_argument("-m", "--message", default="Auto-commit from GitHelper", help="Commit message")

    commit_parser = subparsers.add_parser("commit", help="Commit changes without pushing")
    commit_parser.add_argument("-m", "--message", default="Auto-commit from GitHelper", help="Commit message")

    subparsers.add_parser("pull", help="Pull changes")
    subparsers.add_parser("undo", help="Undo last commit but keep changes")

    deploy_parser = subparsers.add_parser("deploy", help="Deploy repository")
    deploy_parser.add_argument("cmd", nargs="?", help="Deployment command to run")

    run_parser = subparsers.add_parser("run", help="Run a DSL script")
    run_parser.add_argument("file", help="Path to the DSL script file")

    args = parser.parse_args()
    
    # Initialize helper with the specified directory
    helper = GitHelper(args.dir)

    if args.command == "repo":
        helper.get_current_repo()
    elif args.command == "status":
        helper.list_changes()
    elif args.command == "push":
        helper.push_changes(args.message)
    elif args.command == "commit":
        helper.commit_changes(args.message)
    elif args.command == "pull":
        helper.pull_changes()
    elif args.command == "undo":
        helper.undo_last_commit()
    elif args.command == "deploy":
        helper.deploy(args.cmd)
    elif args.command == "run":
        executor = DSLExecutor(helper)
        executor.execute_script(args.file)
    else:
        parser.print_help()

if __name__ == "__main__":
    main()
