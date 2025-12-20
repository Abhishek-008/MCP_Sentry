"""MCP Server for Code Interpreter Agent

This MCP server exposes the code interpreter functionality through the Model Context Protocol.
It provides tools for executing Python code, retrieving generated files, and visualization templates.

Standards followed:
- JSON-RPC over STDIO transport
- Logging to stderr only (never stdout)
- Type hints and docstrings for tool definitions
- FastMCP for simplified server implementation
"""

from __future__ import annotations

import base64
import json
import logging
import os
import shutil
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from mcp.server.fastmcp import FastMCP

# Load environment variables
env_path = Path(__file__).parent / ".env"
load_dotenv(dotenv_path=env_path)

# Configure logging to stderr only (CRITICAL for STDIO transport)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=[logging.StreamHandler()]  # StreamHandler writes to stderr by default
)
logger = logging.getLogger(__name__)

# Import after logging is configured
from agent import LocalCodeInterpreter

# Initialize FastMCP server
mcp = FastMCP("code-interpreter")

# Global code interpreter instance
code_interpreter = None
OUTPUT_DIR = Path(__file__).parent / "output"


def get_code_interpreter() -> LocalCodeInterpreter:
    """Get or create the code interpreter instance."""
    global code_interpreter
    if code_interpreter is None:
        code_interpreter = LocalCodeInterpreter(output_dir=OUTPUT_DIR)
        logger.info("Code interpreter initialized")
    return code_interpreter


@mcp.tool()
async def execute_python_code(code: str) -> str:
    """Execute Python code in a secure sandbox environment.
    
    This tool executes Python code locally using Open Interpreter.
    It can perform calculations, data analysis, generate visualizations,
    and run arbitrary Python code.
    
    Generated files (images, plots, data) are automatically saved to the output directory
    and can be retrieved using the get_generated_files resource.
    
    For matplotlib plots, they will be automatically saved. You can also explicitly use:
    plt.savefig('plot_name.png', dpi=150, bbox_inches='tight')
    
    Args:
        code: Python code to execute. Can be a single line or multi-line code block.
    
    Returns:
        Execution results including stdout, stderr, errors, and information about generated files.
    
    Examples:
        - "print(sum(range(100)))"
        - "import matplotlib.pyplot as plt; plt.plot([1,2,3]); plt.savefig('plot.png')"
        - "import pandas as pd; df = pd.DataFrame({'a': [1,2,3]}); print(df.describe())"
    """
    logger.info(f"Executing Python code (length: {len(code)} chars)")
    
    try:
        interpreter = get_code_interpreter()
        result = interpreter.execute(code)
        
        # Format the result for return
        output_parts = []
        
        # Include stdout
        if result.get("stdout"):
            stdout_content = "\n".join(result["stdout"]) if isinstance(result["stdout"], list) else result["stdout"]
            output_parts.append(f"=== STDOUT ===\n{stdout_content}")
        
        # Include stderr
        if result.get("stderr"):
            stderr_content = "\n".join(result["stderr"]) if isinstance(result["stderr"], list) else result["stderr"]
            output_parts.append(f"=== STDERR ===\n{stderr_content}")
        
        # Include errors
        if result.get("error"):
            output_parts.append(f"=== ERROR ===\n{result['error']}")
        
        # Include interpreter results
        if result.get("results"):
            for idx, res in enumerate(result["results"]):
                if isinstance(res, dict) and res.get("text"):
                    output_parts.append(f"=== RESULT {idx+1} ===\n{res['text']}")
        
        # Report generated files
        generated_files = result.get("generated_files", [])
        if generated_files:
            file_list = []
            for f in generated_files:
                filename = f.get("filename", "unknown")
                file_type = f.get("type", "unknown")
                file_list.append(f"  - {filename} ({file_type})")
            
            output_parts.append(
                f"=== GENERATED FILES ===\n"
                f"Generated {len(generated_files)} file(s):\n" + "\n".join(file_list) +
                f"\n\nUse the 'get_generated_files' resource to retrieve file contents."
            )
        
        if not output_parts:
            output_parts.append("Code executed successfully (no output)")
        
        return "\n\n".join(output_parts)
        
    except Exception as e:
        logger.error(f"Error executing code: {e}", exc_info=True)
        return f"ERROR: {str(e)}"


@mcp.tool()
async def reset_interpreter() -> str:
    """Reset the code interpreter state.
    
    This clears the conversation history and output directory.
    Use this when you want to start fresh or clean up generated files.
    
    Returns:
        Confirmation message
    """
    logger.info("Resetting code interpreter")
    
    try:
        interpreter = get_code_interpreter()
        interpreter.reset()
        return "Code interpreter reset successfully. Conversation history and output files cleared."
    except Exception as e:
        logger.error(f"Error resetting interpreter: {e}", exc_info=True)
        return f"ERROR: {str(e)}"


@mcp.resource("output://generated-files")
async def get_generated_files() -> str:
    """Get information about all generated files in the output directory.
    
    This resource lists all files generated by code execution, including images,
    plots, data files, and text files.
    
    Returns:
        JSON string containing file information with base64-encoded content for images.
    """
    logger.info("Retrieving generated files")
    
    try:
        interpreter = get_code_interpreter()
        files = interpreter._scan_output_dir()
        
        # Format as JSON for easy parsing
        return json.dumps({
            "file_count": len(files),
            "files": files
        }, indent=2)
        
    except Exception as e:
        logger.error(f"Error retrieving generated files: {e}", exc_info=True)
        return json.dumps({"error": str(e)})


@mcp.resource("output://file/{filename}")
async def get_file_content(filename: str) -> str:
    """Get the content of a specific generated file.
    
    Args:
        filename: Name of the file to retrieve
    
    Returns:
        File content (base64-encoded for binary files, plain text for text files)
    """
    logger.info(f"Retrieving file: {filename}")
    
    try:
        file_path = OUTPUT_DIR / filename
        
        if not file_path.exists():
            return json.dumps({"error": f"File not found: {filename}"})
        
        if not file_path.is_file():
            return json.dumps({"error": f"Not a file: {filename}"})
        
        # Determine file type and read accordingly
        suffix = file_path.suffix.lower()
        image_extensions = {'.png', '.jpg', '.jpeg', '.gif', '.bmp', '.svg', '.webp'}
        text_extensions = {'.txt', '.csv', '.json', '.md', '.py', '.html', '.xml'}
        
        if suffix in image_extensions:
            with open(file_path, "rb") as f:
                data = base64.b64encode(f.read()).decode("utf-8")
            return json.dumps({
                "filename": filename,
                "type": "image",
                "encoding": "base64",
                "data": data
            })
        elif suffix in text_extensions:
            with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
                data = f.read()
            return json.dumps({
                "filename": filename,
                "type": "text",
                "encoding": "utf-8",
                "data": data
            })
        else:
            with open(file_path, "rb") as f:
                data = base64.b64encode(f.read()).decode("utf-8")
            return json.dumps({
                "filename": filename,
                "type": "binary",
                "encoding": "base64",
                "data": data
            })
            
    except Exception as e:
        logger.error(f"Error retrieving file {filename}: {e}", exc_info=True)
        return json.dumps({"error": str(e)})


@mcp.prompt()
async def visualization_template() -> str:
    """Template for creating data visualizations with matplotlib.
    
    Returns:
        A template prompt showing best practices for creating visualizations.
    """
    return """# Data Visualization Template

When creating visualizations with Python:

1. Import required libraries:
   ```python
   import matplotlib.pyplot as plt
   import numpy as np  # if needed
   ```

2. Define your data:
   ```python
   x = [1, 2, 3, 4, 5]
   y = [2, 4, 6, 8, 10]
   ```

3. Create the plot:
   ```python
   plt.figure(figsize=(10, 6))
   plt.plot(x, y, marker='o')
   plt.xlabel('X Label')
   plt.ylabel('Y Label')
   plt.title('Chart Title')
   plt.grid(True)
   ```

4. Save the plot (REQUIRED):
   ```python
   plt.savefig('plot_name.png', dpi=150, bbox_inches='tight')
   plt.close()
   ```

Common chart types:
- Line plot: plt.plot(x, y)
- Bar chart: plt.bar(x, y)
- Scatter plot: plt.scatter(x, y)
- Histogram: plt.hist(data)
- Pie chart: plt.pie(values, labels=labels)

Remember: Always save plots using plt.savefig() and call plt.close() after!
"""


@mcp.prompt()
async def data_analysis_template() -> str:
    """Template for data analysis tasks with pandas.
    
    Returns:
        A template prompt showing best practices for data analysis.
    """
    return """# Data Analysis Template

For data analysis tasks with pandas:

1. Import libraries:
   ```python
   import pandas as pd
   import numpy as np
   ```

2. Create or load data:
   ```python
   # From dictionary
   df = pd.DataFrame({
       'column1': [1, 2, 3],
       'column2': ['a', 'b', 'c']
   })
   
   # From CSV (if file exists)
   # df = pd.read_csv('data.csv')
   ```

3. Explore the data:
   ```python
   print(df.head())
   print(df.info())
   print(df.describe())
   ```

4. Perform analysis:
   ```python
   # Group by operations
   grouped = df.groupby('column1').agg({'column2': 'count'})
   
   # Filtering
   filtered = df[df['column1'] > 1]
   
   # Statistics
   mean_val = df['column1'].mean()
   ```

5. Visualize results:
   ```python
   df.plot(kind='bar')
   plt.savefig('analysis_plot.png', dpi=150, bbox_inches='tight')
   plt.close()
   ```
"""


def main():
    """Start the MCP server."""
    logger.info("Starting Code Interpreter MCP Server")
    
    # Validate environment
    if not os.getenv("GOOGLE_API_KEY") and not os.getenv("OPENAI_API_KEY"):
        logger.warning(
            "No API key found. Set GOOGLE_API_KEY or OPENAI_API_KEY environment variable. "
            "The interpreter will use a default model."
        )
    
    # Run the server with STDIO transport
    mcp.run(transport="stdio")


if __name__ == "__main__":
    main()
