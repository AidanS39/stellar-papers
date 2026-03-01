import pyalex
import os
from dotenv import load_dotenv
from pprint import pprint

load_dotenv()

pyalex.config.api_key = os.environ["OPENALEX_API_KEY"]

works = pyalex.Works().filter().select(["id", "title", "primary_topic", "referenced_works", "cited_by_count", "publication_year"]).get()
pprint(len(works))