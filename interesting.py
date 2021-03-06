
import requests
import os
import json

github_header = {'content-type': 'application/json'}
if 'GITHUB_TOKEN' in os.environ:
    github_header['Authorization'] = 'Bearer ' + os.environ['GITHUB_TOKEN']

results = []


url = "https://api.github.com/search/repositories?q=topic:k8s-at-home&per_page=100"

items = requests.get(url, headers=github_header).json()['items']
repos = set()
for repo_info in items:
    repo_name = repo_info['full_name']
    stars = repo_info['stargazers_count']
    url = repo_info['html_url']
    branch = repo_info['default_branch']
    results.append((repo_name, url, branch, stars))
    repos.add(repo_name)


awesome_repos = set()
repos_url = "https://raw.githubusercontent.com/k8s-at-home/awesome-home-kubernetes/main/data.json"
data = requests.get(repos_url).json()
for repo in data['user_repositories']:
    # if flux
    if 'gitops_tool' in repo and repo['gitops_tool'] == 'flux':
        name = repo['repo']
        awesome_repos.add(name)


for given_repo_name in awesome_repos:
    if given_repo_name not in repos:
        repo_info = requests.get('https://api.github.com/repos/'+given_repo_name, headers=github_header).json()
        if 'stargazers_count' in repo_info and 'default_branch' in repo_info:
            repo_name = repo_info['full_name']
            if repo_name not in repos:
                repos.add(repo_name)
                stars = repo_info['stargazers_count']
                branch = repo_info['default_branch']
                url = repo_info['html_url']
                # insert or update
                results.append((repo_name, url, branch, stars))

if len(results) < 50:
    print("Not enough repos, error fetching topic github repos")
    exit(1)

# sort results on repo_name
results = sorted(results, key=lambda x: x[0])

j = json.dumps(results, indent=2)
with open('repos.json', 'w') as f:
    f.write(j)

