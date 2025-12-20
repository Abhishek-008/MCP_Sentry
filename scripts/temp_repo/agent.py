"""Local Code Interpreter Agent

This module provides a LocalCodeInterpreter class that executes Python code
using Open Interpreter and manages generated outputs like charts and data files.
"""

from __future__ import annotations

import base64
import logging
import os
import shutil
import sys
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)


class LocalCodeInterpreter:
    """A code interpreter that executes Python code locally using Open Interpreter.
    
    This class provides:
    - Safe Python code execution
    - Automatic output directory management
    - File scanning and encoding for generated files (images, data, etc.)
    - Integration with matplotlib for automatic chart saving
    """
    
    def __init__(self, output_dir: Path | str | None = None):
        """Initialize the code interpreter.
        
        Args:
            output_dir: Directory to save generated files. Defaults to ./output
        """
        self.output_dir = Path(output_dir) if output_dir else Path(__file__).parent / "output"
        self.output_dir.mkdir(parents=True, exist_ok=True)
        
        # Track files that existed before execution
        self._existing_files: set[str] = set()
        
        # Initialize Open Interpreter
        self._init_interpreter()
        
        logger.info(f"LocalCodeInterpreter initialized with output_dir: {self.output_dir}")
    
    def _init_interpreter(self):
        """Initialize the Open Interpreter instance."""
        try:
            from interpreter import interpreter
            
            # Configure interpreter for local execution
            interpreter.auto_run = True
            interpreter.offline = True
            interpreter.llm.model = "local"  # Use local execution without LLM
            interpreter.llm.api_key = "dummy"  # Not needed for local execution
            interpreter.conversation_history = []
            
            # Disable confirmation prompts
            interpreter.safe_mode = "off"
            
            self.interpreter = interpreter
            logger.info("Open Interpreter initialized successfully")
            
        except ImportError as e:
            logger.warning(f"Open Interpreter not available: {e}. Using fallback executor.")
            self.interpreter = None
        except Exception as e:
            logger.warning(f"Error initializing Open Interpreter: {e}. Using fallback executor.")
            self.interpreter = None
    
    def execute(self, code: str) -> dict[str, Any]:
        """Execute Python code and return results.
        
        Args:
            code: Python code to execute
            
        Returns:
            Dictionary containing:
            - stdout: Standard output from execution
            - stderr: Standard error from execution
            - error: Error message if execution failed
            - results: List of result objects
            - generated_files: List of generated file information
        """
        logger.info(f"Executing code:\n{code[:200]}...")
        
        # Track existing files before execution
        self._existing_files = set(f.name for f in self.output_dir.iterdir() if f.is_file())
        
        # Prepare the code with output directory setup
        prepared_code = self._prepare_code(code)
        
        # Execute the code
        result = self._execute_code(prepared_code)
        
        # Scan for newly generated files
        result["generated_files"] = self._scan_output_dir()
        
        return result
    
    def _prepare_code(self, code: str) -> str:
        """Prepare code for execution with proper output directory handling.
        
        Args:
            code: Original Python code
            
        Returns:
            Modified code with output directory setup
        """
        # Add setup code to change to output directory for file saving
        setup_code = f'''
import os
import sys

# Set up output directory
_output_dir = r"{self.output_dir}"
os.makedirs(_output_dir, exist_ok=True)
os.chdir(_output_dir)

# Configure matplotlib for non-interactive backend
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

# Auto-save figures when plt.show() is called
_original_show = plt.show
def _auto_save_show(*args, **kwargs):
    fig = plt.gcf()
    if fig.get_axes():
        import uuid
        filename = f"figure_{{uuid.uuid4().hex[:8]}}.png"
        fig.savefig(filename, dpi=150, bbox_inches='tight')
        print(f"Figure saved to: {{filename}}")
    plt.close('all')
plt.show = _auto_save_show

'''
        return setup_code + code
    
    def _execute_code(self, code: str) -> dict[str, Any]:
        """Execute the prepared code.
        
        Args:
            code: Prepared Python code
            
        Returns:
            Execution result dictionary
        """
        result = {
            "stdout": [],
            "stderr": [],
            "error": None,
            "results": []
        }
        
        # Try Open Interpreter first
        if self.interpreter is not None:
            try:
                return self._execute_with_open_interpreter(code)
            except Exception as e:
                logger.warning(f"Open Interpreter execution failed: {e}. Falling back to exec().")
        
        # Fallback to direct exec()
        return self._execute_with_exec(code)
    
    def _execute_with_open_interpreter(self, code: str) -> dict[str, Any]:
        """Execute code using Open Interpreter.
        
        Args:
            code: Python code to execute
            
        Returns:
            Execution result dictionary
        """
        result = {
            "stdout": [],
            "stderr": [],
            "error": None,
            "results": []
        }
        
        try:
            # Run through Open Interpreter
            messages = self.interpreter.chat(code, display=False, stream=False)
            
            # Process messages
            for msg in messages:
                if msg.get("type") == "console":
                    content = msg.get("content", "")
                    format_type = msg.get("format", "output")
                    
                    if format_type == "output":
                        result["stdout"].append(content)
                    elif format_type == "error":
                        result["stderr"].append(content)
                        
                elif msg.get("type") == "message":
                    content = msg.get("content", "")
                    if content:
                        result["results"].append({"text": content})
                        
        except Exception as e:
            logger.error(f"Open Interpreter error: {e}")
            result["error"] = str(e)
            # Try fallback
            return self._execute_with_exec(code)
        
        return result
    
    def _execute_with_exec(self, code: str) -> dict[str, Any]:
        """Execute code using Python's exec() as fallback.
        
        Args:
            code: Python code to execute
            
        Returns:
            Execution result dictionary
        """
        import io
        from contextlib import redirect_stdout, redirect_stderr
        
        result = {
            "stdout": [],
            "stderr": [],
            "error": None,
            "results": []
        }
        
        stdout_capture = io.StringIO()
        stderr_capture = io.StringIO()
        
        # Create execution namespace
        exec_globals = {
            "__builtins__": __builtins__,
            "__name__": "__main__",
        }
        
        try:
            with redirect_stdout(stdout_capture), redirect_stderr(stderr_capture):
                exec(code, exec_globals)
                
            stdout_output = stdout_capture.getvalue()
            stderr_output = stderr_capture.getvalue()
            
            if stdout_output:
                result["stdout"] = stdout_output.strip().split("\n")
            if stderr_output:
                result["stderr"] = stderr_output.strip().split("\n")
                
        except Exception as e:
            logger.error(f"Execution error: {e}")
            result["error"] = f"{type(e).__name__}: {str(e)}"
            
            # Capture any partial output
            stdout_output = stdout_capture.getvalue()
            stderr_output = stderr_capture.getvalue()
            
            if stdout_output:
                result["stdout"] = stdout_output.strip().split("\n")
            if stderr_output:
                result["stderr"] = stderr_output.strip().split("\n")
        
        return result
    
    def _scan_output_dir(self) -> list[dict[str, Any]]:
        """Scan the output directory for generated files.
        
        Returns:
            List of file information dictionaries
        """
        files = []
        
        try:
            for file_path in self.output_dir.iterdir():
                if not file_path.is_file():
                    continue
                
                # Get file info
                file_info = {
                    "filename": file_path.name,
                    "path": str(file_path),
                    "size": file_path.stat().st_size,
                    "type": self._get_file_type(file_path),
                    "is_new": file_path.name not in self._existing_files
                }
                
                # For images, include base64 encoded content
                if file_info["type"] == "image":
                    try:
                        with open(file_path, "rb") as f:
                            file_info["content_base64"] = base64.b64encode(f.read()).decode("utf-8")
                    except Exception as e:
                        logger.warning(f"Could not read file {file_path}: {e}")
                
                files.append(file_info)
                
        except Exception as e:
            logger.error(f"Error scanning output directory: {e}")
        
        return files
    
    def _get_file_type(self, file_path: Path) -> str:
        """Determine the type of a file based on extension.
        
        Args:
            file_path: Path to the file
            
        Returns:
            File type string
        """
        suffix = file_path.suffix.lower()
        
        image_extensions = {'.png', '.jpg', '.jpeg', '.gif', '.bmp', '.svg', '.webp'}
        text_extensions = {'.txt', '.csv', '.json', '.md', '.py', '.html', '.xml'}
        data_extensions = {'.xlsx', '.xls', '.parquet', '.feather', '.pkl', '.pickle'}
        
        if suffix in image_extensions:
            return "image"
        elif suffix in text_extensions:
            return "text"
        elif suffix in data_extensions:
            return "data"
        else:
            return "binary"
    
    def reset(self):
        """Reset the interpreter state and clear output directory."""
        logger.info("Resetting code interpreter")
        
        # Clear output directory
        if self.output_dir.exists():
            for item in self.output_dir.iterdir():
                try:
                    if item.is_file():
                        item.unlink()
                    elif item.is_dir():
                        shutil.rmtree(item)
                except Exception as e:
                    logger.warning(f"Could not delete {item}: {e}")
        
        # Reset interpreter state
        if self.interpreter is not None:
            try:
                self.interpreter.conversation_history = []
            except:
                pass
        
        self._existing_files = set()
        logger.info("Code interpreter reset complete")
    
    def get_file(self, filename: str) -> dict[str, Any] | None:
        """Get information and content for a specific file.
        
        Args:
            filename: Name of the file to retrieve
            
        Returns:
            File information dictionary or None if not found
        """
        file_path = self.output_dir / filename
        
        if not file_path.exists() or not file_path.is_file():
            return None
        
        file_info = {
            "filename": filename,
            "path": str(file_path),
            "size": file_path.stat().st_size,
            "type": self._get_file_type(file_path)
        }
        
        # Read content based on type
        if file_info["type"] in ("image", "binary", "data"):
            with open(file_path, "rb") as f:
                file_info["content_base64"] = base64.b64encode(f.read()).decode("utf-8")
        else:
            with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
                file_info["content"] = f.read()
        
        return file_info

