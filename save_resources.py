import json
import os
import io
import requests
import datetime
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload
from dotenv import load_dotenv
from pymongo import MongoClient
from urllib.parse import urlparse, parse_qs


# Load environment variables
load_dotenv()

# OAuth scopes needed
SCOPES = ["https://www.googleapis.com/auth/drive.readonly"]

# Set up MongoDB connection
mongo_uri = os.getenv("MONGODB_CONNECTION_STRING")
if not mongo_uri:
    raise ValueError("Missing MONGODB_URI in environment variables")

client = MongoClient(mongo_uri)
db = client.computing_in_context
collection = db.resources


def get_credentials():
    """Get valid user credentials from storage or user authorization."""
    creds = None
    token_path = "token.json"

    # Check if token file exists
    if os.path.exists(token_path):
        with open(token_path, "r") as token:
            creds = Credentials.from_authorized_user_info(json.load(token))

    # If no valid credentials, let the user log in
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            # Use client_id from environment
            client_id = os.getenv("GOOGLE_OAUTH_CLIENT_ID")
            client_secret = os.getenv(
                "GOOGLE_OAUTH_CLIENT_SECRET"
            )  # You'll need this too

            if not client_id or not client_secret:
                raise ValueError("Missing OAuth credentials in environment variables")

            # Create client config from environment variables
            client_config = {
                "installed": {
                    "client_id": client_id,
                    "client_secret": client_secret,
                    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                    "token_uri": "https://oauth2.googleapis.com/token",
                    "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
                    "redirect_uris": ["urn:ietf:wg:oauth:2.0:oob", "http://localhost"],
                }
            }

            flow = InstalledAppFlow.from_client_config(client_config, SCOPES)
            creds = flow.run_local_server(port=0)

        # Save the credentials for the next run
        with open(token_path, "w") as token:
            token.write(creds.to_json())

    return creds


def fetch_colab_notebook(url):
    """Fetch the content of a Colab notebook using OAuth authentication."""
    try:
        # Extract the file ID from the Colab URL
        parsed_url = urlparse(url)
        file_id = parse_qs(parsed_url.query).get("id", [None])[0]

        if not file_id:
            # If ID not in query params, try to get it from the path
            path_parts = parsed_url.path.split("/")
            if "drive" in path_parts:
                drive_index = path_parts.index("drive")
                if len(path_parts) > drive_index + 1:
                    file_id = path_parts[drive_index + 1]

        if not file_id:
            print(f"Could not extract file ID from URL: {url}")
            return None

        # Initialize credentials and build Drive API client
        creds = get_credentials()  # You already have this function in your code
        service = build("drive", "v3", credentials=creds)

        # Get the file
        request = service.files().get_media(fileId=file_id)

        # Download the file content
        file = io.BytesIO()
        downloader = MediaIoBaseDownload(file, request)
        done = False
        while done is False:
            status, done = downloader.next_chunk()

        # Parse the notebook content as JSON
        file.seek(0)
        notebook_content = json.loads(file.read().decode("utf-8"))
        return notebook_content

    except Exception as e:
        print(f"Error fetching Colab notebook: {e}")
        return None


def fetch_github_notebook(url):
    """Fetch the content of a GitHub notebook and parse it as JSON."""
    try:
        raw_url = url.replace("github.com", "raw.githubusercontent.com").replace(
            "/blob", ""
        )
        response = requests.get(raw_url)
        response.raise_for_status()
        notebook_text = response.text

        # Parse the notebook content as JSON
        try:
            notebook_content = json.loads(notebook_text)
            return notebook_content
        except json.JSONDecodeError as e:
            print(f"Error parsing GitHub notebook as JSON: {e}")
            return None
    except requests.exceptions.RequestException as e:
        print(f"Error fetching GitHub notebook: {e}")
        return None


def save_to_mongodb(url, content):
    """Save the notebook content to MongoDB."""
    if content:
        # Make sure content is a notebook dictionary
        if not isinstance(content, dict):
            try:
                # Try to parse as JSON if it's a string
                content = json.loads(content)
            except (json.JSONDecodeError, TypeError):
                print(f"Content for {url} is not a valid notebook format")
                return

        notebook = {
            "url": url,
            "content": content,
            "date_saved": datetime.datetime.now(),
        }
        collection.insert_one(notebook)
        print(f"Saved {url} to MongoDB as .ipynb")
    else:
        print(f"Failed to save {url} to MongoDB")


def process_colab_links(colab_links):
    """Process a list of Colab links."""
    """ for link in colab_links:
        content = fetch_colab_notebook(link)
        save_to_mongodb(link, content) """


def process_github_links(github_links):
    """Process a list of GitHub links."""
    for link in github_links:
        content = fetch_github_notebook(link)
        save_to_mongodb(link, content)


import os


def export_notebooks_from_mongodb(output_dir="downloaded_notebooks"):
    """Export all notebooks from MongoDB to .ipynb files on disk."""
    # Create output directory if it doesn't exist
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)
        print(f"Created output directory: {output_dir}")

    # Query all notebooks from MongoDB
    all_notebooks = collection.find({})
    count = 0

    for notebook in all_notebooks:
        try:
            # Extract a filename from the URL
            url = notebook["url"]
            if "colab.research.google.com" in url:
                # For Colab, use the file ID as the filename
                file_id = url.split("/")[-1]
                filename = f"colab_{file_id}.ipynb"
            elif "github.com" in url:
                # For GitHub, use the repo and filename
                parts = url.replace("https://github.com/", "").split("/")
                repo = "_".join(parts[:2])  # org_repo
                filename = f"github_{repo}_{parts[-1]}"
                if "blob" in filename:
                    # Clean up filename if it contains 'blob'
                    filename = filename.replace("blob_", "")
            else:
                # Generic fallback
                filename = f"notebook_{count}.ipynb"

            # Make sure the filename ends with .ipynb
            if not filename.endswith(".ipynb"):
                filename += ".ipynb"

            # Create full path
            filepath = os.path.join(output_dir, filename)

            # Write notebook content to file
            with open(filepath, "w", encoding="utf-8") as f:
                json.dump(notebook["content"], f, ensure_ascii=False, indent=2)

            print(f"Exported: {filepath}")
            count += 1

        except Exception as e:
            print(f"Error exporting notebook {count}: {e}")

    print(f"Exported {count} notebooks to {output_dir} directory")


def main():
    # All resource links
    resource_links = [
        f"https://colab.research.google.com/drive/1hDc7mFYqFKmuHZFxBI6Wmbko0aV7gocT",
        f"https://colab.research.google.com/drive/1g5R7yHZ8JZoEC8cBNPg_bmaYct-6hEty",
        f"https://colab.research.google.com/drive/1yduCM27PE_hY2iR-Ty2IH8VZYDou7Y8h",
        f"https://colab.research.google.com/drive/1EOkyYItM08l6d_hOvqm-6O6meSsSrvO8",
        f"https://colab.research.google.com/drive/1JydLf4di0o5cu606jRGwoiDhIo5RkqZV",
        f"https://colab.research.google.com/drive/1roIrozam_cPjtJ6NKZvSEBOUvbOe8bjq",
        f"https://colab.research.google.com/drive/139kc056PTFtgXt6H2WzGI1PRbe5ZkTqI",
        f"https://colab.research.google.com/drive/145zgscHHzhl89W9e9H00VbNAm28tRAaw",
        f"https://colab.research.google.com/drive/1WTLnsJQJuVI25GdM35kie0dflKLdmy8E",
        f"https://colab.research.google.com/drive/1i7tmFhjubDN9vO93ATnV9zxMsSezgDGk",
        f"https://colab.research.google.com/drive/190WfEXBmCYx4ZjxXGa4rjX53BH8JB8aP",
        f"https://colab.research.google.com/drive/122fVeH11cRVAAfvTenn7I4H57ZZMSSGP",
        f"https://colab.research.google.com/drive/1gk60qbIdO-UJSN6bcGlWJxsdVoOFwwS5",
        f"https://colab.research.google.com/drive/13okyapuAjHAW9yIV_ZFN2ma5k5vCdSgu",
        "https://colab.research.google.com/drive/1t_6ycttIeR7HZtXF0wyCDLTCLpeFmuMc",
        "https://colab.research.google.com/drive/1Hdl_gE3cWy9Z_mXR9fwb1R-Gw6GvZAMZ",
        "https://colab.research.google.com/drive/1YVh6E47Z3u2o7jYcR3oyTeWruwTl4W49",
        "https://colab.research.google.com/drive/1qsDMuRE9DWP2lk1b_C2uP_P0KIttICmV",
        "https://colab.research.google.com/drive/1GbXV7XtpPPtEN1ppd_4o3BOzXAlgyQrr",
        "https://colab.research.google.com/drive/1pSoiXMPC6i3NvkY_pTMifGVDG4RgqTQy",
        "https://colab.research.google.com/drive/1QGUkfrJL3Rn29DoPhRtz-6t0_Uw9xrei",
        "https://colab.research.google.com/drive/17X4JvlhhT6_GdCSdQ263Jhu65PVMCG9o",
        "https://colab.research.google.com/drive/1-nVJEOfR9XOuyKmpQqSjJlawS6uaHVZx",
        "https://colab.research.google.com/drive/1MJV2S8smKHFwSAitTeuWaLtdIyD3Bt5e",
        "https://colab.research.google.com/drive/1v-_U9EiMeDa6Wsxfdm1Ci234e0sHMp9u",
        "https://colab.research.google.com/drive/1FT4_F_dBpNgobbWcIyOfLnNVaO9HQE9O",
        "https://colab.research.google.com/drive/1V2Cap_3TyDQ7D5mUy8R1efRuCMsuG-M-",
        "https://colab.research.google.com/drive/11DSqv6r9GOfKej1KPon5pwIRjcEVE74e",
        "https://colab.research.google.com/drive/1QsoHdReuX35Jo3MH5ee5CN0_eYYKd3kG",
        "https://colab.research.google.com/drive/15TUbb_H8mWr4Q1nI0S76PEQH8mO91lmk",
        "https://colab.research.google.com/drive/10sk026PhqzjdNIYfMArhVJ4D5gJKGPcr",
        "https://colab.research.google.com/drive/1aLBdOXuLi6InF4ZtOkNVHHg0yQryP6cH",
        "https://colab.research.google.com/drive/17OurVO4fXdcslY50_gzsw_7QemtvGJga",
        "https://colab.research.google.com/drive/1kJ18kupuA6KKapwZaaVRA_v1I5BrBYp1",
        "https://colab.research.google.com/drive/1Is6bjj4U1yRhgrygElYlgfSrh3NbBtgF",
        "https://colab.research.google.com/drive/1tUsoyGDeBGAEuJcslK9V02vbFKIbp-62",
        "https://colab.research.google.com/drive/1yizmUbmr4jgXCS5n3dSMz0PVIgzL02Qy",
        "https://colab.research.google.com/drive/1B2AcSY0ZJufVMiYJ-3CXzEmcrCjioX2J",
        "https://colab.research.google.com/drive/1qMsouHrne1585Tv_NiqgJw3738jk2_0D",
        "https://colab.research.google.com/drive/1f6ouJtQEQaeofNpFkG5t4RmaiHuTcnQY",
        "https://colab.research.google.com/drive/14GDB76WEzkFePB8WIKDdgHVI_EaBO46E",
        "https://colab.research.google.com/drive/1fq0xYRMdC--fHhI0sWsUcIHUJeD9MsvG",
        "https://colab.research.google.com/drive/13qVZT-3vrjUk5XNFLsXxQYEiYTFf1qIa",
        "https://colab.research.google.com/drive/1ggwzZUA1uMnQr_FqC7QSQbRew8Y486A2",
        "https://colab.research.google.com/drive/1f03dxWYu5wE5R30ZSDH034G0ruKuRN3z",
        "https://colab.research.google.com/drive/1Gk0CYDcFj0uN9cyvTMQ3Wl687M8yPzFw",
        "https://colab.research.google.com/drive/1EEh870raxXpA8mtmuPnuJ7qo__BMFIDY",
        "https://colab.research.google.com/drive/1CnBmoavlYOILmcaWbYXOGz2-kTMYn_ng",
        "https://colab.research.google.com/drive/1RjPP8dLmwAUvmHy9fj-_qizrcUN5fEf6",
        "https://colab.research.google.com/drive/1Eqv6vJVeozU9fYGS4Ry8vQIHNE99vpn3",
        "https://colab.research.google.com/drive/1TMNRAmkoUdFZSQC5zRvuGagGrf0aLxHc",
        "https://colab.research.google.com/drive/1HeF6U_PZpDzAiwJvTsHKQWBTgFwEnMCu",
        "https://colab.research.google.com/drive/1albCVdVIturwxYlJ4PSrD4BnJWruvGo2",
        "https://colab.research.google.com/drive/1Jp9AXercbAOJ2jqzv-AUUCWZedByqjJ9",
        "https://colab.research.google.com/drive/1OKx_83f8eMGBxoL4fLZbbDpWfyQIfFsK",
        "https://colab.research.google.com/drive/14FnkPRMI9ceW6IA8bFW9bkSv1MurFtJA",
        "https://colab.research.google.com/drive/15Q0c3uXnqqzbjzvrDbSMVQR7MTPvzD8v",
        "https://colab.research.google.com/drive/1fO7pM9Mf938DpkLoMP8h2DrVjLIO5x5q",
        "https://colab.research.google.com/drive/1sTDbR6u10OoWPF7eyGXmzbgA2xdd7oR1",
        "https://colab.research.google.com/drive/1yHaKNGEaQf4MkK5aHemPU9cib5NrzBPR",
        "https://colab.research.google.com/drive/1WnYCWt-dCnrl-09EgekV5wbnGZTM-vEv",
        "https://colab.research.google.com/drive/1AEEhcsOiOBvUNqtlGpG3YLoq23Uv9v_M",
        "https://colab.research.google.com/drive/1KU86jhwkxx3wDGxZ2giY-mnlekjfkLBT",
        "https://colab.research.google.com/drive/1h5uEGqzNW9JUsiRxSzLDZvYldsfkFq67",
        "https://colab.research.google.com/drive/1AaBTY6q9To-_DVUSw84PdM9xQ4DwcPXg",
        "https://colab.research.google.com/drive/1W23rgSwhaF1lpSryHbQUlIyNcObdQifp",
        "https://colab.research.google.com/drive/1TuF7CjJWxiOHhZE03D9OIpFMZ0r0JLOs",
        "https://colab.research.google.com/drive/1tU6FHunLbHTokyeD1alFRphfvUFZ0LIW",
        "https://colab.research.google.com/drive/1cbpFdRLkEzjpj-trKIwjSDFCJpgnobnS",
        "https://colab.research.google.com/drive/1XVoE0AfQEkrWmFWD33GhEdvCPChcaJzC",
        "https://colab.research.google.com/drive/1C3ml2IKzkfQnIwJijEAgwP7ZDLxtLVSr",
        "https://colab.research.google.com/drive/1dlj-1Y1YLTCMUpDNbGXcnSYpMHd_Yrdu",
        "https://colab.research.google.com/drive/1jPw7vXaRIXMB0cb2vf9eFX7hFzMFgGbd",
        "https://colab.research.google.com/drive/15v1sVDofWT-9ZpLThxpolTUQBTE__mjg",
        "https://colab.research.google.com/drive/1R29T5XfVEthAmdXKMz62wiaPQeP2w2Sj",
        "https://colab.research.google.com/drive/1R1cyCtIeHEZC152YV7IYfW0BXhcPLAwz",
        "https://colab.research.google.com/drive/1lrfV1u_Vvlb_iL7VxA4A4CG9ftik-9Tt",
        "https://colab.research.google.com/drive/1lMtD3kcbviL1oRWvs60HGNUwMod8mHSM",
        "https://colab.research.google.com/drive/1GHHNmuCXZdcTBlAM9SGNf_wyk1aaaJBK",
        "https://colab.research.google.com/drive/1rDZ8CCcOjRq3bLZ1GcURprxN5ciLRsZO",
        "https://colab.research.google.com/drive/1uLXF7l9uHADf4njs-JHPuZQWyfT0wYoJ",
        "https://colab.research.google.com/drive/13WreSwPato8fiqgVwx5M9RbLjjaUiY1j",
        "https://colab.research.google.com/drive/1NXJ3Q_FUiLSqpmQw_QOrna9z0mkAGjNf",
        "https://colab.research.google.com/drive/1z4iTLMUdipEkN_-TROf2vQabvUzJkFIp",
        "https://colab.research.google.com/drive/1dfqB7YaaGBmRmSR28X5M0p0eLcXZNa3L",
        "https://colab.research.google.com/drive/104rYzDS76j_8Bb-ektFHQiC-srSqQ01m",
        "https://colab.research.google.com/drive/1-hWpHqvUlOjvUoFYse1tZzrrZsu9g812",
        "https://colab.research.google.com/drive/1uWHdHpqBb2ke5hgJv7eE85hsgIl2Kmrq",
        "https://colab.research.google.com/drive/1YxEhdadB28M2VEHvrfCvn_duRFguLXQo",
        "https://colab.research.google.com/drive/1Dav47q_qyv-fmGsdM0DQwCyuQTjNWYzx",
        "https://colab.research.google.com/drive/1beV4OFm9csAZ9bLtZm1CTpy6uC7w0eRg",
        "https://colab.research.google.com/drive/1681uJfiqHm21SLK9xdNHQIG5986VB9XG",
        "https://colab.research.google.com/drive/1IuBWa8x424Ok76XuUNTrSpaSbk8_9MgT",
        "https://colab.research.google.com/drive/1PyhT4TEUyarE_6VrkCqaEF06OAg2sDRS",
        "https://colab.research.google.com/drive/108zblOKusFzNBGVEJOLjDJ6uWyvzdEIz",
        "https://colab.research.google.com/drive/1WX0eowUs3XNrqrsEUok0J18rhNaMQ3Gf",
        "https://colab.research.google.com/drive/1EATs9Kpb0_rEWa7ghaGn5TPHfv6g2FmF",
        "https://colab.research.google.com/drive/1PZD0JAzspS1XqQdhDimdVgSz52wr9K_T",
        "https://colab.research.google.com/drive/1wewqF23HP_wq7syhbjxajiKICJviG4AD",
        "https://colab.research.google.com/drive/1fKXW_dTiSBz547HQwc3HZg7hxc8HFH1v",
        "https://colab.research.google.com/drive/1bgIEFx6oXNeJzBkf54spJaoG0Juthj1C",
        "https://colab.research.google.com/drive/12CPqzr6gcXFGu8xXWF2xmo5aOIA1BIpA",
        "https://colab.research.google.com/drive/1b5RJkQEsZU_PTl8EE6pH3ZkNg5IbKAZS",
        "https://colab.research.google.com/drive/1-KNf9TV8LhqEXfS9qei66iEgIIS0AsIx",
        "https://colab.research.google.com/drive/1Nr0x6IJ-PHdkIoddarZuyt2RKj7QAoW0",
        "https://colab.research.google.com/drive/1VRnKbUeLZ_1npIrVIPp39zxw2HBMQphS",
        "https://colab.research.google.com/drive/1LLRNfFGUmLSiz9AvJeewvDcke--WQFsu",
        "https://colab.research.google.com/drive/1qVob2pA7S6W0i-gM89G1sJUgMB-yEFAb",
        "https://colab.research.google.com/drive/1KSGuRW1oSKGHRONFJ1k9wYu5m8IC5gSQ",
        "https://colab.research.google.com/drive/14Z-EE8JxWaMzpMhGuAw42iB2pwpF3g5F",
        "https://colab.research.google.com/drive/1tE1A2f6Lvuw0PeNCEzGFriRLDTFisImP",
        "https://colab.research.google.com/drive/1mP5R_CLfoeUMKPcpuAngy6NylbWogHff",
        "https://colab.research.google.com/drive/1AjThoDAoA1PskOlZI0ypnSdPv81nHjOt",
        "https://colab.research.google.com/drive/1EeouPjSA17UMwl9xoHqNSUzSAQTXizZr",
        "https://colab.research.google.com/drive/1Gbu24xy5OUuLolJldjgKlF2JDbfxB9JL",
        "https://colab.research.google.com/drive/1TBBBx1SUXGmLPR-JRq2PyzDPRhamJ4x8",
        "https://colab.research.google.com/drive/1hCKQX4pCUEtKL1HIwwspUWR4L9M29-y9",
        "https://colab.research.google.com/drive/112pifLwG1mF6AX2y6KselhlRfx1ktqlD",
        "https://colab.research.google.com/drive/1oTijIwr7AmM-uo54y0xyZl5j0-PSULhz",
        "https://colab.research.google.com/drive/1NMCqqt5xwJH2eMWvbqKrf6W0UjfBcxpA",
        "https://colab.research.google.com/drive/1D1GQs2bhUCvOkiUKGj8zyJpxZemfOcP4",
        "https://colab.research.google.com/drive/1bChECwSc0Er5JMSI-gR9jrHDrpAWm2VO",
        "https://colab.research.google.com/drive/1E0TRSuembTEBMngYsKWIsiBBLTh7UvzR",
        "https://colab.research.google.com/drive/1ocLNT6--45SWzulJqvF6NOOFIHXL16l6",
        "https://colab.research.google.com/drive/1Sdqi25VZ1pi-ch52Z2phv4LPeCQjVm60",
        "https://colab.research.google.com/drive/1IyCnf3umli9wg8JnEMVGoLzIjxbn5X8m",
        "https://colab.research.google.com/drive/11xmLhLQqlTiTh3RLEyvTJzczli5VuA1_",
        "https://colab.research.google.com/drive/19dBDfrY99xp6Q-OeAMYgFI95KTnEkN8w",
        "https://colab.research.google.com/drive/1eexeLCke6TrnERgAOK5JtZsn-7qPHuew",
        "https://colab.research.google.com/drive/1j5DSx_bArNC7BESe065SH8nA-Kjg5_2n",
        "https://colab.research.google.com/drive/1UMx3Va584RvCZAEswngydlNQc7J4WYfU",
        "https://colab.research.google.com/drive/1X5cEb4cTDhtOQGKTnh3xIM7hfNuqiBrr",
        "https://colab.research.google.com/drive/1kunowkFYMxEcJBDMTlyXx7RolgXIA5m8",
        "https://colab.research.google.com/drive/1GEiSYA6Q_e0XKqbOrelqq2qWDcZIrby8",
        "https://colab.research.google.com/drive/1eL1ISeUKsnWOiVFBSIN1r3ii_n2OsmMF",
        "https://colab.research.google.com/drive/1b_TZaffaESbC1w823ON0VS60rlJYDY4b",
        "https://colab.research.google.com/drive/1FqpCKdId72o4wDwurX9mBC-HeZ4pKh62",
        "https://colab.research.google.com/drive/19ASSVegIC5g4ow0kg-Wdk2AvxMBNSbPu",
        "https://colab.research.google.com/drive/1e_B6zcEfTaoG8tyK_ARHWen8CA_Jlwpq",
        "https://colab.research.google.com/drive/179rz8Rw-cBkCnj-V-U2rteTEJ1FrZ7mK",
        "https://colab.research.google.com/drive/13W_u70M_ETDnD4ztcKQX4nlA_oBgf-FX",
        "https://colab.research.google.com/drive/1XS8zt5Sqh4X_yep_wa7ktdQFjwmI0qvY",
        "https://colab.research.google.com/drive/1OmCH5fwxuz4Um3bRX26SJihf2Tp0B4DK",
        "https://colab.research.google.com/drive/1pRPcfbCnVCbYYj0-gXnzWJSPr4V8o4Wc",
        "https://colab.research.google.com/drive/1Q_-TdIPjsr3fSyHqe7FRNdocjVccU0eL",
        "https://colab.research.google.com/drive/1ciiFI3n-O_eDO0tlNb_cDWzrs95jEiW4",
        "https://colab.research.google.com/drive/12zcbPyTDc1Fx8ZrQ1w2r99A3kkHwuOjM",
        "https://colab.research.google.com/drive/12zcbPyTDc1Fx8ZrQ1w2r99A3kkHwuOjM",
        "https://colab.research.google.com/drive/1rxWqWyu5eOhDBiyhTi-xi0cTHEL0foQp",
        "https://colab.research.google.com/drive/1vnLCh10QoQEXFZvJU_Zu8REWPia1Sif4",
        "https://colab.research.google.com/drive/1SSwUGyMXrJ9X4C_nGLKEp8Wbry6aUeZQ",
        "https://colab.research.google.com/drive/1RFb6xeveXObcMnAl97pXKmmKpWl4lOGZ",
        "https://colab.research.google.com/drive/1ONV1rQotAUVnBbXmOpbfqNaGk0aTTrzY",
        "https://colab.research.google.com/drive/1Hm5dW0Hy-65uj-dJ9Deqzfgue4thI1by",
        "https://colab.research.google.com/drive/1u97Qk8wF0-7iXGdXeg_89Nk2igu2nsNK",
        "https://colab.research.google.com/drive/162Hic9leptQZTS0gbm7KeUqh7gL3TQ7C",
        "https://colab.research.google.com/drive/1pEEcN3TZOiCLh6JvKY9jk5pTjbhR0KDY",
        "https://colab.research.google.com/drive/1xIs7zV35ASBRzpGofIxipTjcbKu6DYz0",
        "https://colab.research.google.com/drive/18dD4ilUg3zRsmncTH-GPaXSUJQsWlXJb",
        "https://colab.research.google.com/drive/1I4EXmhhbehIuOhP2vopBLp8FIGyIV8k2",
        "https://colab.research.google.com/drive/1Y8VXPtJGgU8Qzl-PT4YxexFq8qLSsQ2c",
        "https://colab.research.google.com/drive/12Yd8CJ9x_0mXsAFSxSZ4zS6SOQ-qOhee",
        "https://colab.research.google.com/drive/13v6eHXe3SdR5uH1jIKXoXw7dujhUfbUq",
        "https://colab.research.google.com/drive/1TA_mEKy_TkI7z6JszAMv8zWFRLq0r8hU",
        "https://colab.research.google.com/drive/1tPDxh21A8YO7ossbqKphRTGXbeH5dUgG",
        "https://colab.research.google.com/drive/1HjTzi5TmqqOoXZ25hfeCyYd6HU9M1xl8",
        "https://colab.research.google.com/drive/1OkYG5LVnKdm1hTHSuiXOylSvAnBCZNrM",
        "https://colab.research.google.com/drive/1wqTX7HE6irdD9LTSw4gQcZjxnIct1Ojh",
        "https://colab.research.google.com/drive/1jCk3aOzDdP-AGxunwTbYE9eSb3fVjq9m",
        "https://colab.research.google.com/drive/1rGXn2KqpSmTh9pXUHOMy9rX683m9upyq",
        "https://colab.research.google.com/drive/1DSR6kv8iq7bf3sgABd04sO_onFQmIS8A",
        "https://colab.research.google.com/drive/1ixU11jlh_DFvQvOf5Yr1Aeacxy5Bft5N",
        "https://colab.research.google.com/drive/1BMIuB133cAcZdK7ZD9SPxrS2mRFt14fS",
        "https://colab.research.google.com/drive/1b3hor_76hwAF_NNozk9XncubEz2z7n-b",
        "https://colab.research.google.com/drive/1wBPN1ASVVVI2oWxlEqCN4gHJWQFR9l_s",
        "https://colab.research.google.com/drive/1Elkrc_nb7jjEEgxlPDYkr0YW_7we0E9b",
        "https://colab.research.google.com/drive/12TtYWUcVsCObu_eCvz62O8abi6ICtv0G",
        "https://colab.research.google.com/drive/1VkZLT34tIjRhQkxErYHtE7PF0hCnssm9",
        "https://colab.research.google.com/drive/1RokC9JcehmkZEgGrLkOEDvsOl4RMUZXC",
        "https://colab.research.google.com/drive/1fMptzjNbknSmFlvFl6-yCW0qLxaps_a1",
        "https://colab.research.google.com/drive/19gP0P11WnWRiKUKfNl4F0I8vxgNhB7TM",
        "https://colab.research.google.com/drive/1cFadKImyRCNdbmNN7KBeXm5aUkBBM50V",
        "https://colab.research.google.com/drive/1Dm-FPi8zSJOFVp08KK9fEdIY-cka4pQH",
        "https://colab.research.google.com/drive/1a38NStD62o4rcWhDoRbXhlMLwhLpTWGx",
        "https://colab.research.google.com/drive/19VHQnaD8bn6laPf_VCYNdAVbAOEme77U",
        "https://colab.research.google.com/drive/18puQXvXToQIcFtqCWqCNcV983x7t7xc_",
        "https://colab.research.google.com/drive/1iSAiWcVS-Kos4YIRH45lqSWy8MIsLU27",
        "https://colab.research.google.com/drive/1mPNtb09_aIbL8JkY3g8oyHKogaE2ewFV",
        "https://colab.research.google.com/drive/1rTJFTIPhmwrA7-VMBiJDWLaG4ImhVHZr",
        "https://colab.research.google.com/drive/1vB0lXF5N-XZmH6r2yAOyfa872wSYZ6Tc",
        "https://colab.research.google.com/drive/1RNQSqF0CePMOZkahz7YkD9giPAJ5dG_P",
        "https://colab.research.google.com/drive/1QWQdJRDmWaxp3T2BzGrMqwXyotGeLupV",
        "https://colab.research.google.com/drive/1tbv-_-1QkqnAlFoN6EgpI2BXkJtk9RrR",
        "https://colab.research.google.com/drive/18gMTi_n630by9UGRWrsYiacfmp8s3CXZ",
        "https://colab.research.google.com/drive/1xDOT8BRs5-Cb0yOoRbzE_Bpyq944q6T6",
        "https://colab.research.google.com/drive/1dWbmkfQljMtPSxJrmhMZSwoMeJIgK82u",
        "https://colab.research.google.com/drive/1yTh9EtJAZPyrd9oPhtlUm5luNEoPkyil",
        "https://colab.research.google.com/drive/1bF12xQW-NReeRCMLMPiYbFLw29Tyo1Hp",
        "https://colab.research.google.com/drive/159Ga5CgMls1pY-yksikPpcwhSQgwZ-l9",
        "https://colab.research.google.com/drive/1JlaGThNg853GiQKZ7H5dEZAvAABv7Fu-",
        "https://colab.research.google.com/drive/1HmsCq89XnJF6RW5EOwUarSOu-pyFt0sz",
        "https://colab.research.google.com/drive/1AHPKCI37R5a1OuTKuMF_l66KcvUqrZVw",
        "https://colab.research.google.com/drive/1XuA1kSQ3-bgPmDBBa9XtDO10N_CqpZkx",
        "https://colab.research.google.com/drive/1XSAgaRwr_0MMvy3LaSq5PXOLQXnVdX1_",
        "https://colab.research.google.com/drive/1tVY3AImn43JEXMLHM3J2FvDHmce-kQ2n",
        "https://colab.research.google.com/drive/14ym0ITUZmK590cxj3mHnrC_UmcGl9r0K",
        "https://colab.research.google.com/drive/1juViT9WsZfLa6Pm_3Hk2DpPNazz33myl",
        "https://colab.research.google.com/drive/1ZA_cLeFLI1sMFuqdov9iOjaR-cyaxNfZ",
        "https://colab.research.google.com/drive/11wj-FQL4qfeTFOJF5zgxiibVXMDQiV3P",
        "https://colab.research.google.com/drive/1vbtxeniv0rnGRrRZgnplODljMYf6Kc8J",
        "https://colab.research.google.com/drive/1MZwPpXZtdE7Cy16J1Xvtp8B0sPo5k28X",
        "https://colab.research.google.com/drive/1p1KQMPVSqZVPENcfjQJnIxRRLqFEnEuL",
        "https://colab.research.google.com/drive/1RrSoTsQfmRpin-4_Sb0aT-k6GC9OOHjp",
        "https://colab.research.google.com/drive/1Ec3lFPY26gednL47RnW6LaiiiNE7Cnnf",
        "https://colab.research.google.com/drive/1t2xjAl5rt7f5zQb4ErwuAR2G8wN5KyHO",
        "https://colab.research.google.com/drive/1m5dWvlQhDlcxmRS8Cs1nvS9SDrk1_2uI",
        "https://colab.research.google.com/drive/1KsFvVqpSskzrX_q8ZptLMTtXgaN_OQbh",
        "https://colab.research.google.com/drive/1pMOfJph8RtYnm9BIilXyW9_1AX4rICMT",
        "https://colab.research.google.com/drive/1KCf7SbGBmCOrO5JffrpekeYFHYPtSjG3",
        "https://colab.research.google.com/drive/1_4hadG7x_s6fNt4SWoNTfkpIdwLod4tn",
        "https://colab.research.google.com/drive/1f3QA98FdxR7mYkgxEHG9O3YpHNHELKnO",
        "https://colab.research.google.com/drive/1hBWLi0wDXPzFg67h393ny6KfR6QKZwBd",
        "https://colab.research.google.com/drive/1e8NuGFblNrUppm2ZAQ5TJemnFi2rs6EM",
        "https://colab.research.google.com/drive/1DCnk3wk7loqKBWdwk7CckDfvKkEKifNq",
        "https://colab.research.google.com/drive/1e9tHZ2_rOCJfA-JFyWHghZPcUV1KNHHP",
        "https://colab.research.google.com/drive/13u4g-MadpCOkguKt4FE-Gr2etBVCjJf3",
        "https://colab.research.google.com/drive/18h0p_9RpzwjLM1fbNhjGlhyBS9D_NzeM",
        "https://colab.research.google.com/drive/1VZdOalN5KJ9ciDs4TITSGIY0p2p6Qf9k",
        "https://colab.research.google.com/drive/1gT9rkkvbiL5G06tlUO6kLbnS5TpVlRT1",
        "https://colab.research.google.com/drive/168xxCF4XK31Hl-cQwP_gwHx5O57v4dbL",
        "https://colab.research.google.com/drive/1IAKe8xd-ktbDyiKm9FejBJt7mfKdKU1_",
        "https://colab.research.google.com/drive/1p2uvs84fuXi6vQ-2Va6baPsyVYa5jDDl",
        "https://colab.research.google.com/drive/1ZGeOyb-EMbYsABwlK8ztc7deFTPgpvc1",
        "https://colab.research.google.com/drive/1SLVK-OZ8jAaTVHcL11oTOC9RG61HVtol",
        "https://colab.research.google.com/drive/1_3KSEoLSzfrpoF3bPHgHStbiZjpf28IM",
        "https://colab.research.google.com/drive/1t5Qv3_nj33dJ-JakIb-ruAo7TyUHk_0g",
        "https://colab.research.google.com/drive/11zygkh51_5YwBg6z4BM0JNbtnMGaV6HV",
        "https://colab.research.google.com/drive/1KJGOLq3xBDEKMahQ9WCD-twss5MstyLA",
        "https://colab.research.google.com/drive/1V1eNpm6eUX1tvXsiYBT1qukBqAJTo0Pn",
        "https://colab.research.google.com/drive/18f-LtOM0oEcUuTv9avdK4PHY09XZJ4Zg",
        "https://colab.research.google.com/drive/1REPLeWvaI_1Rwp4-04NjE4YLGxe8VxN8",
        "https://colab.research.google.com/drive/1moJ321Yx4izGZ_l3On2icyMkSxrCDVUr",
        "https://colab.research.google.com/drive/1rq9bDlVxq4h00VAHh0oKn4hA1t8FU0N_",
        "https://colab.research.google.com/drive/1QtAfgoTf5S9EaMcc72e9NtFhVdzPSCMF",
        "https://colab.research.google.com/drive/1tBdraksoMqmhTfxZbEqMznGTw_keV20g",
        "https://colab.research.google.com/drive/1qPWYmAlAXgQPJdvVX190V0WGpdfWQk2j",
        "https://colab.research.google.com/drive/1kqYj-L9QZ6XxWhYWY3UI14ra6cFCaavp",
        "https://colab.research.google.com/drive/1PcihIMSebRnHaXv7nheV0I4Fuso5tozi",
        "https://colab.research.google.com/drive/10KVanBlRWiIzKC-LYutcUCS7yZ-0nhyV",
        "https://colab.research.google.com/drive/1nJa5FN14CPLsSuvkw2FyZAiN-jerSErc",
        "https://colab.research.google.com/drive/1Ntp8iKrRcE5Pyw8ryQ2gyRJMYk0LKP9c",
        "https://colab.research.google.com/drive/11aJINCDBu0k-sIwj_wO8bVol1qbWxHox",
        "https://colab.research.google.com/drive/1-RNzLUUnpqzLPhYIAcnf8fKKH4ugsnIG",
        "https://colab.research.google.com/drive/1UJPGcZA4MhU7uqMAlWMW2_KDJR5aom92",
        "https://colab.research.google.com/drive/1t0hn0m0Wlv8Wcp4BFQ6XywQkOHEmG_Ow",
        "https://colab.research.google.com/drive/1WcWq8ovFMHeRoXrIBUth0VSsrtyLWEZq",
        "https://colab.research.google.com/drive/1D0FrsHrGFf4tRhsyryEOjZVtvgtU8Ges",
        "https://colab.research.google.com/drive/1tmE-0L3G-7TWqdqosXF6KFodPiS7qtn2",
        "https://colab.research.google.com/drive/1Lnau4aYaXm-Z5GJL8neOTQgNZLgeh0DD",
        "https://colab.research.google.com/drive/1Wye4ydy82WVGJzXrcrSCnONZ7lYv42nR",
        "https://colab.research.google.com/drive/13IildFxb0RAvIP6etVxmz67weZo0EmH3",
        "https://colab.research.google.com/drive/1pEKOc0jV9SxBjz2vsoLKLhjOcpbXzACf",
        "https://colab.research.google.com/drive/1NKY9Nii3rlJ7chcZAu8mxONP5PPv8QJ_",
        "https://colab.research.google.com/drive/1JGJV-FzQVgBTFu4nogdwDFjcbK56EOSW",
        "https://colab.research.google.com/drive/14WETZlivuguC1RMHxXGEsu5c8Ktoil45",
        "https://colab.research.google.com/drive/1NwxJ-Vn-eW0cq4gNy2-UVg1ntcIfB79y",
        "https://colab.research.google.com/drive/1S-5k7mLrYxtnMpLjcAcx5CrgRISD0EFA",
        "https://colab.research.google.com/drive/1P7SS4zLcWDjb1AWayz3q7_XMR7vcjY9U",
        "https://colab.research.google.com/drive/1jL9q-k-YeFwrALnH6cFB5c3tobolyzA4",
        "https://colab.research.google.com/drive/1-Gwypz74EkRKnrPuxEjDlGPavGzsscTu",
        "https://colab.research.google.com/drive/1uv8yW98myk8rFy2abU5FZ6dqeufiFvEq",
        "https://colab.research.google.com/drive/1fhFoyumQLEEs5oWsg4yPQCKdKxDikzmv",
        "https://colab.research.google.com/drive/1uH7-nTCIA4m1Tnz_ilhukUjsPYr2Wq4q",
        "https://colab.research.google.com/drive/1Cm229-UDPGz-Us6L8zyAJkMkUkttvg8p",
        "https://colab.research.google.com/drive/1CQnAZybIxxftwYxV3AVi0QHpojEAFiQy",
        "https://colab.research.google.com/drive/1yy-eSIlEDhnXMJIr89sRy5uF1PcZpBbd",
        "https://colab.research.google.com/drive/1rrwpPn2KVyNDf896x_H1fJKlb3-XmBSv",
        "https://colab.research.google.com/drive/1X_9cErCZOn-AjtLQo_xsDUMEeDjlNBDQ",
        "https://colab.research.google.com/drive/1kHQKHLyvpXeY-Ff4lAP59lzaDj5zKTCo",
        "https://colab.research.google.com/drive/1aiFZF7GU3GXvetlUjfOIKgTeE1SDZzTK",
        "https://colab.research.google.com/drive/1R8V17_B2Hqkj9ptmsCw_hpynE0wXpvXX",
        "https://colab.research.google.com/drive/1EvzcMjvMpduSruXR3xb0RYm5iysp3JyJ",
        "https://colab.research.google.com/drive/1nDbjUxI6GbuF1Tcu-V63oNN15KFV-jei",
        "https://colab.research.google.com/drive/1KkVpHg38c4eqvRf4u9FzJ0baHZ1WEUcn",
        "https://colab.research.google.com/drive/1lLfxAlzZvbeksgRs-Y9pM_JXNItj6pYA",
        "https://colab.research.google.com/drive/1vrehOjro9y2QZ5AVe3Ntni4Y3mlv6dUT",
        "https://colab.research.google.com/drive/1p6LljAc5ukWZX4xifabbEN3FheALXKgk",
        "https://colab.research.google.com/drive/1ZB-gyIWR7ZxxeYomciKjUtcKojpTZnnd",
        "https://colab.research.google.com/drive/1gW19iDZG4BXXn6WMfDjc2-2ybzF6_0-q",
        "https://colab.research.google.com/drive/1blUn4JGSWBf-odSb0yGlTi8P2km_30xY",
        "https://colab.research.google.com/drive/16BhLaHexd9_7DuajUw7Jg8aOlcxhhLQT"
        f"https://github.com/ds-modules/LINGUIS-110/blob/master/FormantsUpdated/Assignment.ipynb",
        f"https://github.com/ds-modules/LINGUIS-110/blob/master/VOT/Assignment.ipynb",
        f"https://github.com/ds-modules/SOC-130AC/blob/master/clean-data-extract-coordinates.ipynb",
        f"https://github.com/ds-modules/ECON-101B/blob/master/Previous/Problem%20Set%201/Problem%20Set%201.ipynb",
        f"https://github.com/ds-modules/ECON-101B/blob/master/Problem%20Set%203/flex_price.ipynb",
        f"https://github.com/ds-modules/XENGLIS-31AC",
        f"https://github.com/ds-modules/PSYCH-167AC/blob/master/01-Intro-to-Importing-Data-Tables-Graphs.ipynb",
        f"https://github.com/ds-modules/PSYCH-167AC/blob/master/02-Correlation-Regression.ipynb",
        f"https://github.com/ds-modules/PSYCH-167AC/blob/master/03-My-Project.ipynb",
        f"https://github.com/ds-modules/XRHETOR-R1A/blob/master/01%20-%20Data%20Science%20in%20xRhetoric%20Intro/01%20-%20Data%20Science%20in%20xRhetoric%20Intro.ipynb",
        f"https://github.com/ds-modules/XRHETOR-R1A/blob/master/02-Moral-Foundations-Analysis/02-Moral-Foundations-Theory.ipynb",
        f"https://github.com/ds-modules/XRHETOR-R1A/blob/master/03-Rhetoric-of-Data/03-Rhetoric-of-Data-2018.ipynb",
        f"https://github.com/ds-modules/CUNEIF-102A/blob/master/Notebook-Part1-Intro%26TextAnalysis.ipynb",
        f"https://github.com/ds-modules/CUNEIF-102A/blob/master/Notebook-Part2-Visualization.ipynb",
        f"https://github.com/ds-modules/LEGALST-190/blob/master/labs/3-22/3-22_EDA_Solutions.ipynb",
        f"https://github.com/ds-modules/ANTH-115/blob/main/notebook1/Notebook%201.ipynb",
        f"https://github.com/ds-modules/ANTH-115/blob/main/notebook2/Notebook%202.ipynb",
        f"https://github.com/ds-modules/ANTH-115/blob/main/notebook3/Notebook%203.ipynb",
        f"https://github.com/ds-modules/Art-Studio-Code/blob/main/Extract_Color_Utility.ipynb",
        f"https://github.com/ds-modules/Art-Studio-Code/blob/main/artworksEDAv02.ipynb",
        f"https://github.com/ds-modules/ART-W23AC/blob/master/Module%202%20-%20Social%20Network%20Evolution/notebook.ipynb",
        f"https://github.com/ds-modules/Bio-1B/blob/master/Darwin%20Finches/Jupyter%20Introduction%20Darwin's%20Finches%20-%20July24.ipynb",
        f"https://github.com/ds-modules/Bio-1B/blob/master/Mousey/Mousey.ipynb",
        f"https://github.com/ds-modules/Bio-1B/blob/master/Predator%20Prey/Predator%20Prey%20Notebook.ipynb",
        f"https://github.com/ds-modules/CE200B/blob/main/HW1.ipynb",
        f"https://github.com/ds-modules/CE200B/blob/main/HW2/HW2.ipynb",
        f"https://github.com/ds-modules/CE200B/blob/main/HW3.ipynb",
        f"https://github.com/ds-modules/CIVENG-190/blob/main/Notebook%202/NB2%20Google%20Street%20View%20Monitoring.ipynb",
        f"https://github.com/ds-modules/CIVENG-190/blob/main/Notebook%203/NB3%20Electrical%20Vehicle%20Charging.ipynb",
        f"https://github.com/ds-modules/CIVENG-190/blob/main/Notebook%204/NB4%20Coastal%20Resilience.ipynb",
        f"https://github.com/ds-modules/CIVENG-190/blob/main/Notebook%205/NB5%20Wastewater%20Monitoring.ipynb",
        f"https://github.com/ds-modules/DATA88-SP22/blob/main/Lecture1/lecture1.ipynb",
        f"https://github.com/ds-modules/DATA88-SP22/blob/main/Lecture2/lecture2.ipynb",
        f"https://github.com/ds-modules/DATA88-SP22/blob/main/Lecture3/lecture3.ipynb",
        f"https://github.com/ds-modules/DATA88-SP22/blob/main/Lecture4/lecture4.ipynb",
        f"https://github.com/ds-modules/DATA88-SP22/blob/main/Lecture5/lecture5.ipynb",
        f"https://github.com/ds-modules/DATA88-SP22/blob/main/Lecture6/lecture6.ipynb",
        f"https://github.com/ds-modules/DATA88-SP22/blob/main/Lecture7/lecture7.ipynb",
        f"https://github.com/ds-modules/DATA88-SP22/blob/main/Lecture8/lecture8.ipynb",
        f"https://github.com/ds-modules/DATA88-SP22/blob/main/Lecture9/lecture9.ipynb",
        f"https://github.com/ds-modules/ECON-101B/blob/master/Intro%20(Problem%20Set%201)/PS1.ipynb",
        f"https://github.com/ds-modules/ECON-101B/blob/master/Problem%20Set%203/flex_price.ipynb",
        f"https://github.com/ds-modules/ECON-130-FA24/blob/main/Section4/Section%204%20-%20Intro%20to%20Jupyter%20and%20R%20.ipynb",
        f"https://github.com/ds-modules/ECON-140-SP23-SB/blob/main/ps1/ps1.ipynb",
        f"https://github.com/ds-modules/ECON-140-SP23-SB/blob/main/ps2/ps2.ipynb",
        f"https://github.com/ds-modules/ECON-140-SP23-SB/blob/main/ps3/ps3.ipynb",
        f"https://github.com/ds-modules/ECON-140-SP23-SB/blob/main/ps4/ps4.ipynb",
        f"https://github.com/ds-modules/ECON-140-SP23-SB/blob/main/ps5/ps5.ipynb",
        f"https://github.com/ds-modules/ECON-144-SP24/blob/main/ps1/ps1.ipynb",
        f"https://github.com/ds-modules/ECON-144-SP24/blob/main/ps2/ps2.ipynb",
        f"https://github.com/ds-modules/ECON-144-SP24/blob/main/ps3/ps3.ipynb",
        f"https://github.com/ds-modules/ECON-144-SP24/blob/main/ps4/ps4.ipynb",
        f"https://github.com/ds-modules/EDUC-223B/blob/master/02-Prediction.ipynb",
        f"https://github.com/ds-modules/EEP-147-SP24/blob/main/ESG-Analysis/ESG_Analysis_v2025.1.ipynb",
        f"https://github.com/ds-modules/EPS-115-SP20/blob/master/IC_Flexure/Flex2D.ipynb",
        f"https://github.com/ds-modules/EPS-115-SP20/blob/master/IC_Grain_Settling/IC_Grain_Settling.ipynb",
        f"https://github.com/ds-modules/EPS-115-SP20/blob/master/IC_sandstone_ternary/.ipynb_checkpoints/sandstone_ternary_diagram-checkpoint.ipynb",
        f"https://github.com/ds-modules/EPS-115-SP20/blob/master/P1_Chemical_Weathering/P1_Chemical_Weathering_Python_Intro.ipynb",
        f"https://github.com/ds-modules/EPS-115-SP20/blob/master/P2_Sediment_Transport/P2_Settling_Bedforms.ipynb",
        f"https://github.com/ds-modules/EPS-115-SP20/blob/master/P3_Basin_Development/P3_Basin_Development.ipynb",
        f"https://github.com/ds-modules/EPS-115-SP20/blob/master/P4_Carbon_PETM/P4_Carbon_PETM.ipynb",
        f"https://github.com/ds-modules/EPS-130-SP22/blob/main/EPS_Homework1/eps130_hw1_gutenberg_richter_v3.0.ipynb",
        f"https://github.com/ds-modules/EPS-130-SP22/blob/main/EPS_Homework2/eps130_hw2_forecasting.ipynb",
        f"https://github.com/ds-modules/EPS-130-SP22/blob/main/EPS130_Homework5/eps130_hw5_seismicRefraction_v3.0.ipynb",
        f"https://github.com/ds-modules/EPS-130-SP22/blob/main/EPS130_Homework6/eps130_hw6_seismicRays_v2.0_assignment.ipynb",
        f"https://github.com/ds-modules/EPS-130-SP22/blob/main/EPS130_Homework7/eps130_hw7_surfacewaves_assignment.ipynb",
        f"https://github.com/ds-modules/EPS-C20/blob/master/01-EWT/warning_relationships.py",
        f"https://github.com/ds-modules/EPS-C20/blob/master/02-MAG/MagPlay.ipynb",
        f"https://github.com/ds-modules/EPS88-24031-FA23/blob/main/week01_datahubfiles/W01_assignment_seafloor.ipynb",
        f"https://github.com/ds-modules/EPS88-24031-FA23/blob/main/week01_datahubfiles/W01_inclass_elevation.ipynb",
        f"https://github.com/ds-modules/EPS88-24031-FA23/blob/main/week02_datahubfiles/W02_assignment_Earthquakes.ipynb",
        f"https://github.com/ds-modules/EPS88-24031-FA23/blob/main/week02_datahubfiles/w02_inclass_earthquake.ipynb",
        f"https://github.com/ds-modules/EPS88-24031-FA23/blob/main/week03_datahubfiles/Week03_inclass_seafloor_spreading.ipynb",
        f"https://github.com/ds-modules/ETHSTD-22AC-SP23/blob/main/Lecture_1.ipynb",
        f"https://github.com/ds-modules/ETHSTD-22AC-SP23/blob/main/Lecture_2.ipynb",
        f"https://github.com/ds-modules/ETHSTD-22AC-SP23/blob/main/Lecture_3.ipynb",
    ]

    colab_links = list(
        filter(lambda x: "colab.research.google.com" in x, resource_links)
    )
    github_links = list(filter(lambda x: "github.com" in x, resource_links))

    # Process Colab links
    process_colab_links(colab_links)

    # Process GitHub links
    process_github_links(github_links)


if __name__ == "__main__":
    main()
